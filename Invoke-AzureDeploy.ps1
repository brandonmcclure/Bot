$accounts = @(
	
)

$accountCount = $accounts | Measure-Object | Select-Object -ExpandProperty Count

Write-Host "$accountCount accounts"
Write-Host "Getting access_tokens"
$containerCount = 1
$accountIndex =1
$accessTokenString=''
foreach ($account in $accounts){

	

	$b = ("{0}:{1}" -f $($account.clientID),$($account.clientSecret))
	$base64AuthInfo = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($b))

	$body = @{
		"grant_type" ="password"
		"username"=$account.username
		"password"=$account.userpass
	}
	$accessTokenString += "$(Invoke-RestMethod -ErrorAction Stop -Headers @{Authorization=("Basic {0}" -f $base64AuthInfo)} -Uri "https://www.reddit.com/api/v1/access_token?grant_type=password&username=$($account.username)&password=$($account.userpass)" -Method POST -ContentType "application/json" -Verbose | Select-Object -ExpandProperty access_token -ErrorAction Stop),"

	$accountIndex++
	
	if($accountIndex%4-eq 0 -or $accountIndex -eq ($accountCount+1)){
		Write-Host "Creating a container"
		az container create -g fokcars --name worker$containerCount --image bmcclure89/placebot:latest --cpu 1 --memory 1 --environment-variables ACCESS_TOKEN=$($accessTokenString.Substring(0,$accessTokenString.Length))

		$accessTokenString=''
		$containerCount++
	}
	
}