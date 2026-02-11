import neo4j from "neo4j-driver";

const globalForNeo4j = globalThis as unknown as {
  neo4jDriver: ReturnType<typeof neo4j.driver> | undefined;
};

const driver =
  globalForNeo4j.neo4jDriver ??
  neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic("neo4j", process.env.NEO4J_PASSWORD!)
  );

if (process.env.NODE_ENV !== "production") globalForNeo4j.neo4jDriver = driver;

export default driver;
