import neo4j from "neo4j-driver";

const globalForNeo4j = globalThis as unknown as {
  neo4jDriver: ReturnType<typeof neo4j.driver> | undefined;
};

function getDriver(): ReturnType<typeof neo4j.driver> {
  if (!globalForNeo4j.neo4jDriver) {
    const uri = process.env.NEO4J_URI;
    const password = process.env.NEO4J_PASSWORD;
    if (!uri || !password) {
      throw new Error("NEO4J_URI and NEO4J_PASSWORD must be set");
    }
    globalForNeo4j.neo4jDriver = neo4j.driver(
      uri,
      neo4j.auth.basic("neo4j", password)
    );
  }
  return globalForNeo4j.neo4jDriver;
}

export default getDriver;
