const fs = require("fs");
const { config } = require("./config");

function bridgeSource(server) {
  const template = fs.readFileSync(config.bridgeTemplate, "utf8");
  return template
    .replaceAll("%%SERVER_NAME%%", String(server.name).replace(/[\r\n"]/g, " "))
    .replaceAll("%%API_BASE%%", config.publicUrl)
    .replaceAll("%%SERVER_TOKEN%%", server.token);
}

module.exports = { bridgeSource };
