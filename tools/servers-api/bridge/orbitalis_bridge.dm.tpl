// Orbitalis bridge for %%SERVER_NAME%%
// Add this file to the .dme, then:
//   world/New()          -> orbitalis_bridge_start()
//   client/New()         -> orbitalis_bridge_login(src)
//
// To send map, alert and round, replace orbitalis_collect_status()
// later in the build. Return a list with any of:
//   players, playing, mapName, securityLevel, roundId, roundDurationSec, gamestate

var/const/orbitalis_api_base = "%%API_BASE%%"
var/const/orbitalis_server_token = "%%SERVER_TOKEN%%"

/client
	var/orbitalis_discord_id
	var/orbitalis_discord_name

/proc/orbitalis_bridge_start()
	set waitfor = 0
	while (TRUE)
		orbitalis_post_status()
		sleep(300)

/proc/orbitalis_collect_status()
	var/list/status = list()
	status["players"] = length(clients)
	status["mapName"] = world.name
	return status

/proc/orbitalis_post_status()
	var/list/status = orbitalis_collect_status()
	if (!islist(status))
		return
	orbitalis_http_post("/api/ingest/status", status)

/proc/orbitalis_bridge_login(client/C)
	set waitfor = 0
	if (!istype(C))
		return null
	var/ticket = ""
	if (world.params && world.params["orbitalis_ticket"])
		ticket = world.params["orbitalis_ticket"]
	var/list/fields = list(
		"ckey" = C.ckey,
		"address" = C.address,
		"ticket" = ticket
	)
	var/text = orbitalis_http_post("/api/ingest/login", fields)
	if (!text)
		return null
	var/list/data = json_decode(text)
	if (!islist(data) || !data["ok"])
		return data
	var/list/discord = data["discord"]
	if (islist(discord))
		C.orbitalis_discord_id = discord["id"]
		C.orbitalis_discord_name = discord["globalName"] || discord["username"]
	return data

/proc/orbitalis_http_post(path, list/fields)
	if (!islist(fields))
		fields = list()
	fields["token"] = orbitalis_server_token
	var/result = world.Export("[orbitalis_api_base][path]", list2params(fields), 80)
	if (!islist(result) || !result["CONTENT"])
		return null
	return file2text(result["CONTENT"])
