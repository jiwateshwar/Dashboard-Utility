#!/bin/bash
TOKEN=$(cat apiaccesstoken.key | tr -d '\r\n ')
FILTER='{"label":["com.docker.compose.project=dashboard-utility"]}'
for i in $(seq 1 24); do
  /c/Windows/System32/curl.exe -sk -o containers_poll.json -H "X-API-Key: $TOKEN" -G --data-urlencode "filters=$FILTER" --data-urlencode "all=true" "https://172.25.47.101:9443/api/endpoints/3/docker/containers/json"
  STATE=$(node -e '
    const d=JSON.parse(require("fs").readFileSync("containers_poll.json","utf8"));
    const f=d.find(c=>c.Names[0].includes("frontend"));
    console.log(f ? f.State + " | " + f.Status : "not found");
  ')
  echo "attempt $i: $STATE"
  if echo "$STATE" | grep -q "^running"; then
    echo "FRONTEND_UP"
    exit 0
  fi
  sleep 5
done
echo "TIMEOUT_STILL_NOT_RUNNING"
exit 1
