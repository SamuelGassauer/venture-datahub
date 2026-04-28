import { prisma } from "../db";
import driver from "../neo4j";
import { normalizeCompany, normalizeInvestor } from "./normalize";
import { syncToGraph } from "../graph-sync";
import type { Session, ManagedTransaction } from "neo4j-driver";

// ============================================================================
// SNAPSHOT TYPES — stored in dedup_candidates.merge_snapshot for undo
// ============================================================================

export type RelInventory = {
  type: string;
  props: Record<string, unknown>;
  /** For outgoing rels (loser → other): targetUuid is set */
  targetUuid: string | null;
  targetLabels: string[];
  /** For incoming rels (other → loser): sourceUuid is set */
  sourceUuid: string | null;
  sourceLabels: string[];
};

export type Neo4jLoserSnapshot = {
  uuid: string;
  label: "Company" | "InvestorOrg";
  properties: Record<string, unknown>;
  outgoing: RelInventory[];
  incoming: RelInventory[];
};

export type StringFieldChange = {
  kind: "string";
  table: "funding_rounds" | "fund_events" | "company_value_indicators" | "posts";
  field: string;
  /** Per-row id + previous value (preserves case/whitespace variants) */
  updates: { id: string; oldValue: string }[];
  newValue: string;
};

export type ArrayFieldChange = {
  kind: "array";
  table: "funding_rounds";
  field: "investors";
  updates: { id: string; oldArr: string[]; newArr: string[] }[];
};

export type PostgresChange = StringFieldChange | ArrayFieldChange;

export type MergeSnapshot = {
  type: "company" | "investor";
  loserUuid: string;
  winnerUuid: string;
  loserName: string;
  winnerName: string;
  mergedAt: string;
  /** Marker written to transferred relationships on the winner */
  mergeMarker: string;
  neo4j: Neo4jLoserSnapshot;
  postgres: PostgresChange[];
};

// ============================================================================
// SNAPSHOT BUILDER
// ============================================================================

async function buildLoserSnapshot(
  session: Session,
  label: "Company" | "InvestorOrg",
  uuid: string,
): Promise<Neo4jLoserSnapshot> {
  const node = await session.run(
    `MATCH (n:${label} {uuid: $uuid}) RETURN properties(n) AS props`,
    { uuid },
  );
  if (!node.records.length) throw new Error(`Loser ${label} not found: ${uuid}`);
  const properties = node.records[0].get("props") as Record<string, unknown>;

  const outgoing = await session.run(
    `MATCH (n:${label} {uuid: $uuid})-[r]->(target)
     RETURN type(r) AS type, properties(r) AS props,
            target.uuid AS targetUuid, labels(target) AS targetLabels`,
    { uuid },
  );

  const incoming = await session.run(
    `MATCH (source)-[r]->(n:${label} {uuid: $uuid})
     RETURN type(r) AS type, properties(r) AS props,
            source.uuid AS sourceUuid, labels(source) AS sourceLabels`,
    { uuid },
  );

  return {
    uuid,
    label,
    properties,
    outgoing: outgoing.records.map((r) => ({
      type: r.get("type") as string,
      props: (r.get("props") as Record<string, unknown>) ?? {},
      targetUuid: (r.get("targetUuid") as string | null) ?? null,
      targetLabels: (r.get("targetLabels") as string[]) ?? [],
      sourceUuid: null,
      sourceLabels: [],
    })),
    incoming: incoming.records.map((r) => ({
      type: r.get("type") as string,
      props: (r.get("props") as Record<string, unknown>) ?? {},
      targetUuid: null,
      targetLabels: [],
      sourceUuid: (r.get("sourceUuid") as string | null) ?? null,
      sourceLabels: (r.get("sourceLabels") as string[]) ?? [],
    })),
  };
}

// ============================================================================
// COMPANY MERGE
// ============================================================================

export async function mergeCompany(
  loserUuid: string,
  winnerUuid: string,
): Promise<MergeSnapshot> {
  if (loserUuid === winnerUuid) throw new Error("Cannot merge a node into itself");

  const session = driver().session();
  const mergedAt = new Date().toISOString();
  const mergeMarker = `${loserUuid}->${winnerUuid}@${mergedAt}`;

  try {
    const both = await session.run(
      `MATCH (l:Company {uuid: $loserUuid}), (w:Company {uuid: $winnerUuid})
       RETURN l.name AS loserName, l.normalizedName AS loserNorm,
              w.name AS winnerName`,
      { loserUuid, winnerUuid },
    );
    if (!both.records.length) throw new Error("Loser or winner Company not found");
    const loserName = both.records[0].get("loserName") as string;
    const loserNorm = both.records[0].get("loserNorm") as string;
    const winnerName = both.records[0].get("winnerName") as string;

    const neo4jSnapshot = await buildLoserSnapshot(session, "Company", loserUuid);

    // Find Postgres rows matching loser's normalized name (catches case/spelling variants)
    const allRounds = await prisma.fundingRound.findMany({ select: { id: true, companyName: true } });
    const affectedRounds = allRounds.filter((r) => normalizeCompany(r.companyName) === loserNorm);

    const allCvi = await prisma.companyValueIndicator.findMany({
      select: { id: true, companyName: true },
    });
    const affectedCvi = allCvi.filter((r) => normalizeCompany(r.companyName) === loserNorm);

    const allPosts = await prisma.post.findMany({ select: { id: true, companyName: true } });
    const affectedPosts = allPosts.filter((r) => normalizeCompany(r.companyName) === loserNorm);

    const postgresChanges: PostgresChange[] = [];

    await prisma.$transaction(async (tx) => {
      if (affectedRounds.length > 0) {
        for (const r of affectedRounds) {
          await tx.fundingRound.update({
            where: { id: r.id },
            data: { companyName: winnerName },
          });
        }
        postgresChanges.push({
          kind: "string",
          table: "funding_rounds",
          field: "company_name",
          updates: affectedRounds.map((r) => ({ id: r.id, oldValue: r.companyName })),
          newValue: winnerName,
        });
      }
      if (affectedCvi.length > 0) {
        for (const r of affectedCvi) {
          await tx.companyValueIndicator.update({
            where: { id: r.id },
            data: { companyName: winnerName },
          });
        }
        postgresChanges.push({
          kind: "string",
          table: "company_value_indicators",
          field: "company_name",
          updates: affectedCvi.map((r) => ({ id: r.id, oldValue: r.companyName })),
          newValue: winnerName,
        });
      }
      if (affectedPosts.length > 0) {
        for (const r of affectedPosts) {
          await tx.post.update({
            where: { id: r.id },
            data: { companyName: winnerName },
          });
        }
        postgresChanges.push({
          kind: "string",
          table: "posts",
          field: "company_name",
          updates: affectedPosts.map((r) => ({ id: r.id, oldValue: r.companyName })),
          newValue: winnerName,
        });
      }
    });

    try {
      await session.executeWrite(async (tx: ManagedTransaction) => {
        await tx.run(
          `MATCH (l:Company {uuid: $loserUuid})-[r:HQ_IN]->(target)
           MATCH (w:Company {uuid: $winnerUuid})
           MERGE (w)-[wr:HQ_IN]->(target)
           ON CREATE SET wr._mergeMarker = $mergeMarker
           DELETE r`,
          { loserUuid, winnerUuid, mergeMarker },
        );
        await tx.run(
          `MATCH (l:Company {uuid: $loserUuid})-[r:HAS_METRIC]->(target)
           MATCH (w:Company {uuid: $winnerUuid})
           MERGE (w)-[wr:HAS_METRIC]->(target)
           ON CREATE SET wr._mergeMarker = $mergeMarker
           DELETE r`,
          { loserUuid, winnerUuid, mergeMarker },
        );
        // Loser's RAISED FundingRounds get hard-deleted; syncToGraph rebuilds
        // them under the winner with correct roundKeys from updated Postgres data.
        await tx.run(
          `MATCH (l:Company {uuid: $loserUuid})-[:RAISED]->(fr:FundingRound)
           DETACH DELETE fr`,
          { loserUuid },
        );
        await tx.run(
          `MATCH (l:Company {uuid: $loserUuid}), (w:Company {uuid: $winnerUuid})
           SET w.description   = COALESCE(w.description,   l.description),
               w.website       = COALESCE(w.website,       l.website),
               w.linkedinUrl   = COALESCE(w.linkedinUrl,   l.linkedinUrl),
               w.foundedYear   = COALESCE(w.foundedYear,   l.foundedYear),
               w.employeeRange = COALESCE(w.employeeRange, l.employeeRange),
               w.country       = COALESCE(w.country,       l.country),
               w.sector        = COALESCE(w.sector,        l.sector),
               w.totalFundingUsd = COALESCE(w.totalFundingUsd, l.totalFundingUsd)`,
          { loserUuid, winnerUuid },
        );
        await tx.run(`MATCH (l:Company {uuid: $loserUuid}) DETACH DELETE l`, { loserUuid });
      });
    } catch (neo4jErr) {
      // Best-effort Postgres rollback if Neo4j step failed
      await rollbackPostgresChanges(postgresChanges).catch((rollbackErr) => {
        console.error("Postgres rollback after Neo4j failure also failed:", rollbackErr);
      });
      throw neo4jErr;
    }

    // Rebuild FundingRounds for the winner (and others — full sync, but cheap on this dataset).
    // If this fails, the merge itself is intact; rounds will be rebuilt on next worker tick.
    syncToGraph().catch((err) => {
      console.error("Post-merge graph-sync failed (will retry on next worker tick):", err);
    });

    return {
      type: "company",
      loserUuid,
      winnerUuid,
      loserName,
      winnerName,
      mergedAt,
      mergeMarker,
      neo4j: neo4jSnapshot,
      postgres: postgresChanges,
    };
  } finally {
    await session.close();
  }
}

// ============================================================================
// INVESTOR MERGE
// ============================================================================

export async function mergeInvestor(
  loserUuid: string,
  winnerUuid: string,
): Promise<MergeSnapshot> {
  if (loserUuid === winnerUuid) throw new Error("Cannot merge a node into itself");

  const session = driver().session();
  const mergedAt = new Date().toISOString();
  const mergeMarker = `${loserUuid}->${winnerUuid}@${mergedAt}`;

  try {
    const both = await session.run(
      `MATCH (l:InvestorOrg {uuid: $loserUuid}), (w:InvestorOrg {uuid: $winnerUuid})
       RETURN l.name AS loserName, l.normalizedName AS loserNorm,
              w.name AS winnerName`,
      { loserUuid, winnerUuid },
    );
    if (!both.records.length) throw new Error("Loser or winner InvestorOrg not found");
    const loserName = both.records[0].get("loserName") as string;
    const loserNorm = both.records[0].get("loserNorm") as string;
    const winnerName = both.records[0].get("winnerName") as string;

    const neo4jSnapshot = await buildLoserSnapshot(session, "InvestorOrg", loserUuid);

    // Postgres scan: lead_investor (string), investors[] (array), fund_events.firm_name (string)
    const allRoundsLead = await prisma.fundingRound.findMany({
      where: { leadInvestor: { not: null } },
      select: { id: true, leadInvestor: true },
    });
    const affectedLead = allRoundsLead.filter(
      (r) => r.leadInvestor && normalizeInvestor(r.leadInvestor) === loserNorm,
    );

    const allRoundsArr = await prisma.fundingRound.findMany({
      select: { id: true, investors: true },
    });
    const arrayUpdates: { id: string; oldArr: string[]; newArr: string[] }[] = [];
    for (const r of allRoundsArr) {
      const hits = r.investors.filter((inv) => normalizeInvestor(inv) === loserNorm);
      if (hits.length === 0) continue;
      const oldArr = [...r.investors];
      // Replace all loser variants with winnerName, then dedupe
      const replaced = r.investors.map((inv) =>
        normalizeInvestor(inv) === loserNorm ? winnerName : inv,
      );
      const newArr = Array.from(new Set(replaced));
      arrayUpdates.push({ id: r.id, oldArr, newArr });
    }

    const allFundEvents = await prisma.fundEvent.findMany({ select: { id: true, firmName: true } });
    const affectedFundEvents = allFundEvents.filter(
      (e) => normalizeInvestor(e.firmName) === loserNorm,
    );

    const postgresChanges: PostgresChange[] = [];

    await prisma.$transaction(async (tx) => {
      if (affectedLead.length > 0) {
        for (const r of affectedLead) {
          await tx.fundingRound.update({
            where: { id: r.id },
            data: { leadInvestor: winnerName },
          });
        }
        postgresChanges.push({
          kind: "string",
          table: "funding_rounds",
          field: "lead_investor",
          updates: affectedLead.map((r) => ({ id: r.id, oldValue: r.leadInvestor as string })),
          newValue: winnerName,
        });
      }
      if (arrayUpdates.length > 0) {
        for (const u of arrayUpdates) {
          await tx.fundingRound.update({
            where: { id: u.id },
            data: { investors: u.newArr },
          });
        }
        postgresChanges.push({
          kind: "array",
          table: "funding_rounds",
          field: "investors",
          updates: arrayUpdates,
        });
      }
      if (affectedFundEvents.length > 0) {
        for (const e of affectedFundEvents) {
          await tx.fundEvent.update({
            where: { id: e.id },
            data: { firmName: winnerName },
          });
        }
        postgresChanges.push({
          kind: "string",
          table: "fund_events",
          field: "firm_name",
          updates: affectedFundEvents.map((e) => ({ id: e.id, oldValue: e.firmName })),
          newValue: winnerName,
        });
      }
    });

    try {
      await session.executeWrite(async (tx: ManagedTransaction) => {
        // PARTICIPATED_IN with role merge: lead beats participant on conflict
        await tx.run(
          `MATCH (l:InvestorOrg {uuid: $loserUuid})-[r:PARTICIPATED_IN]->(target)
           MATCH (w:InvestorOrg {uuid: $winnerUuid})
           MERGE (w)-[wr:PARTICIPATED_IN]->(target)
           ON CREATE SET wr.role = r.role, wr._mergeMarker = $mergeMarker
           ON MATCH  SET wr.role = CASE
             WHEN wr.role = 'lead' OR r.role = 'lead' THEN 'lead'
             ELSE COALESCE(wr.role, r.role)
           END
           DELETE r`,
          { loserUuid, winnerUuid, mergeMarker },
        );
        await tx.run(
          `MATCH (l:InvestorOrg {uuid: $loserUuid})-[r:MANAGES]->(target)
           MATCH (w:InvestorOrg {uuid: $winnerUuid})
           MERGE (w)-[wr:MANAGES]->(target)
           ON CREATE SET wr._mergeMarker = $mergeMarker
           DELETE r`,
          { loserUuid, winnerUuid, mergeMarker },
        );
        await tx.run(
          `MATCH (l:InvestorOrg {uuid: $loserUuid})-[r:HQ_IN]->(target)
           MATCH (w:InvestorOrg {uuid: $winnerUuid})
           MERGE (w)-[wr:HQ_IN]->(target)
           ON CREATE SET wr._mergeMarker = $mergeMarker
           DELETE r`,
          { loserUuid, winnerUuid, mergeMarker },
        );
        await tx.run(
          `MATCH (l:InvestorOrg {uuid: $loserUuid}), (w:InvestorOrg {uuid: $winnerUuid})
           SET w.country = COALESCE(w.country, l.country)`,
          { loserUuid, winnerUuid },
        );
        await tx.run(
          `MATCH (l:InvestorOrg {uuid: $loserUuid}) DETACH DELETE l`,
          { loserUuid },
        );
      });
    } catch (neo4jErr) {
      await rollbackPostgresChanges(postgresChanges).catch((rollbackErr) => {
        console.error("Postgres rollback after Neo4j failure also failed:", rollbackErr);
      });
      throw neo4jErr;
    }

    return {
      type: "investor",
      loserUuid,
      winnerUuid,
      loserName,
      winnerName,
      mergedAt,
      mergeMarker,
      neo4j: neo4jSnapshot,
      postgres: postgresChanges,
    };
  } finally {
    await session.close();
  }
}

// ============================================================================
// UNDO
// ============================================================================

async function rollbackPostgresChanges(changes: PostgresChange[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const change of changes) {
      if (change.kind === "array") {
        for (const u of change.updates) {
          await tx.fundingRound.update({
            where: { id: u.id },
            data: { investors: u.oldArr },
          });
        }
        continue;
      }
      // String fields
      for (const u of change.updates) {
        const data = { [camelCaseField(change.field)]: u.oldValue } as Record<string, unknown>;
        if (change.table === "funding_rounds") {
          await tx.fundingRound.update({ where: { id: u.id }, data });
        } else if (change.table === "fund_events") {
          await tx.fundEvent.update({ where: { id: u.id }, data });
        } else if (change.table === "company_value_indicators") {
          await tx.companyValueIndicator.update({ where: { id: u.id }, data });
        } else if (change.table === "posts") {
          await tx.post.update({ where: { id: u.id }, data });
        }
      }
    }
  });
}

function camelCaseField(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export async function unmergeFromSnapshot(snap: MergeSnapshot): Promise<void> {
  const session = driver().session();
  try {
    // 1. Restore Postgres
    await rollbackPostgresChanges(snap.postgres);

    // 2. Recreate loser node + restore relationships + remove winner's merge-marked rels
    await session.executeWrite(async (tx: ManagedTransaction) => {
      // Recreate loser node with all original properties
      await tx.run(
        `CREATE (l:${snap.neo4j.label}) SET l = $props`,
        { props: snap.neo4j.properties },
      );

      // Recreate outgoing rels from snapshot
      for (const rel of snap.neo4j.outgoing) {
        if (!rel.targetUuid) continue;
        await tx.run(
          `MATCH (l:${snap.neo4j.label} {uuid: $loserUuid})
           MATCH (target {uuid: $targetUuid})
           CALL apoc.create.relationship(l, $type, $props, target) YIELD rel
           RETURN rel`,
          { loserUuid: snap.loserUuid, targetUuid: rel.targetUuid, type: rel.type, props: rel.props },
        ).catch(async () => {
          // APOC not installed — fall back to typed Cypher per known relationship type
          await tx.run(
            buildTypedRelCypher(snap.neo4j.label, rel.type, "outgoing"),
            { loserUuid: snap.loserUuid, targetUuid: rel.targetUuid, props: rel.props },
          );
        });
      }

      // Recreate incoming rels from snapshot
      for (const rel of snap.neo4j.incoming) {
        if (!rel.sourceUuid) continue;
        await tx.run(
          `MATCH (source {uuid: $sourceUuid})
           MATCH (l:${snap.neo4j.label} {uuid: $loserUuid})
           CALL apoc.create.relationship(source, $type, $props, l) YIELD rel
           RETURN rel`,
          { sourceUuid: rel.sourceUuid, loserUuid: snap.loserUuid, type: rel.type, props: rel.props },
        ).catch(async () => {
          await tx.run(
            buildTypedRelCypher(snap.neo4j.label, rel.type, "incoming"),
            { sourceUuid: rel.sourceUuid, loserUuid: snap.loserUuid, props: rel.props },
          );
        });
      }

      // Delete winner's transferred rels from this specific merge
      await tx.run(
        `MATCH ()-[r]->()
         WHERE r._mergeMarker = $mergeMarker
         DELETE r`,
        { mergeMarker: snap.mergeMarker },
      );
    });

    // For Company unmerge, trigger sync to rebuild FundingRounds the loser had
    if (snap.type === "company") {
      syncToGraph().catch((err) => {
        console.error("Post-unmerge graph-sync failed:", err);
      });
    }
  } finally {
    await session.close();
  }
}

/**
 * Build typed Cypher for known relationship types (fallback when APOC missing).
 * The label-pair table covers everything currently used in the project.
 */
function buildTypedRelCypher(
  loserLabel: "Company" | "InvestorOrg",
  relType: string,
  direction: "outgoing" | "incoming",
): string {
  // Properties on the rel are set via SET r += $props.
  if (direction === "outgoing") {
    return `MATCH (l:${loserLabel} {uuid: $loserUuid})
            MATCH (target {uuid: $targetUuid})
            CREATE (l)-[r:${relType}]->(target)
            SET r += $props`;
  }
  return `MATCH (source {uuid: $sourceUuid})
          MATCH (l:${loserLabel} {uuid: $loserUuid})
          CREATE (source)-[r:${relType}]->(l)
          SET r += $props`;
}
