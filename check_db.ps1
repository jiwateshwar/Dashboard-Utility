[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOjEsInNjb3BlIjoiZGVmYXVsdCIsImZvcmNlQ2hhbmdlUGFzc3dvcmQiOmZhbHNlLCJleHAiOjE3NzU1MDc2NjIsImlhdCI6MTc3NTQ3ODg2MiwianRpIjoiOWVmY2Q4Y2ItNDFhOC00NDMwLThiM2ItMWU0Y2JiMjRkYzNiIn0.0dnDSrN9Jj4vjGdWzdbehzVYACI2sRoq-r7ndqoUlj4'
$cid = '5c6397ee32f993125c36602e01a66c1528402978126d885dca09bfdb70a9129d'
$base = 'https://truenas.local:31015/api/endpoints/3/docker'
$hdrs = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }

function Run-SQL($sql) {
    $execBody = @{ AttachStdout=$true; AttachStderr=$true; Tty=$true; Cmd=@('psql','-U','prism','-d','prism','-c',$sql) } | ConvertTo-Json -Compress
    $execResp = Invoke-RestMethod -Uri "$base/containers/$cid/exec" -Method POST -Headers $hdrs -Body $execBody
    $execId = $execResp.Id
    $startBody = '{"Detach":false,"Tty":true}'
    $req = [System.Net.WebRequest]::Create("$base/exec/$execId/start")
    $req.Method = 'POST'; $req.ContentType = 'application/json'
    $req.Headers.Add('Authorization', "Bearer $token"); $req.Timeout = 20000
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($startBody)
    $req.ContentLength = $bytes.Length
    $stream = $req.GetRequestStream(); $stream.Write($bytes, 0, $bytes.Length); $stream.Close()
    try {
        $resp = $req.GetResponse()
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $reader.ReadToEnd()
    } catch [System.Net.WebException] {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        "ERROR: " + $reader.ReadToEnd()
    }
}

Write-Output "=== CLOSED TASKS: publish_flag and closure_approved_at ==="
Run-SQL "SELECT status, publish_flag, closure_approved_at::text, updated_at::date::text FROM tasks WHERE status='Closed Accepted' ORDER BY updated_at DESC LIMIT 10;"

Write-Output "`n=== OPEN TASKS: publish_flag and target_date ==="
Run-SQL "SELECT status, publish_flag, target_date::text FROM tasks WHERE status IN ('Open','In Progress') AND target_date IS NOT NULL ORDER BY target_date ASC LIMIT 10;"

Write-Output "`n=== SNAPSHOT published_only FLAG ==="
Run-SQL "SELECT cycle_date::text, published_only, jsonb_array_length(content_json->'closedTasks') as closed_count, jsonb_array_length(content_json->'openTasks') as open_count FROM publishing_snapshots ORDER BY cycle_date DESC LIMIT 3;"
