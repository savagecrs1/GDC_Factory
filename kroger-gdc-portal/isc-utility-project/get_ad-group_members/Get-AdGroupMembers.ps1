#Requires -Version 5.1
<#
.SYNOPSIS
    List Active Directory group members with display name and email.

.DESCRIPTION
    Runs LDAP / Get-ADGroupMember first (all group name lengths). Falls back to
    net group "<GroupName>" /domain for names 20 characters or less when LDAP/AD is unavailable.

.PARAMETER GroupName
    One or more AD group names (supports names with spaces).

.PARAMETER GroupListFile
    Text file with one group name per line (# comments and blank lines ignored).

.PARAMETER OutputPath
    Optional CSV output path.

.PARAMETER SkipUserDetails
    Return member account names only (no display name / email lookup).

.PARAMETER PassThru
    Emit member objects to the pipeline.

.EXAMPLE
    .\Get-AdGroupMembers.ps1 -GroupName "Kroger ISC Admins"

.EXAMPLE
    .\Get-AdGroupMembers.ps1 -GroupName "Group A" -OutputPath .\members.csv

.EXAMPLE
    .\Get-AdGroupMembers.ps1 -GroupListFile .\groups.txt -SkipUserDetails

.NOTES
    net group /domain is a fallback for short names when LDAP/AD lookup fails.
    Email and display name require LDAP read access (or ActiveDirectory module).
    Nested group members are listed with MemberType=Group (no email).
#>

[CmdletBinding(DefaultParameterSetName = 'ByName')]
param(
    [Parameter(Mandatory = $true, Position = 0, ParameterSetName = 'ByName')]
    [string[]]$GroupName,

    [Parameter(Mandatory = $true, ParameterSetName = 'ByFile')]
    [string]$GroupListFile,

    [string]$OutputPath,

    [switch]$SkipUserDetails,

    [switch]$PassThru
)

$ErrorActionPreference = 'Stop'
$script:UserDetailCache = @{}
$script:NetGroupNameMaxLength = 20

function Escape-LdapFilterValue {
    param([string]$Value)

    return ($Value -as [string]).Replace('\', '\5c').Replace('*', '\2a').Replace('(', '\28').Replace(')', '\29')
}

function Test-NetGroupOutputFailed {
    param([string[]]$Lines)

    $text = ($Lines -join [Environment]::NewLine).ToLowerInvariant()
    return ($text -match 'the syntax of this command is:' -or $text -match 'system error 1378')
}

function Read-GroupNameList {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Group list file not found: $Path"
    }

    $names = @()
    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = ($_ -as [string]).Trim()
        if (-not $line) { return }
        if ($line.StartsWith('#')) { return }
        $names += $line
    }

    if ($names.Count -eq 0) {
        throw "Group list file contains no group names: $Path"
    }

    return $names
}

function Split-MemberIdentity {
    param([string]$Member)

    $member = ($Member -as [string]).Trim()
    if ($member -match '^([^\\]+)\\(.+)$') {
        return @{
            Domain      = $Matches[1]
            AccountName = $Matches[2]
        }
    }

    return @{
        Domain      = $env:USERDOMAIN
        AccountName = $member
    }
}

function Get-LdapNamingContext {
    if ($script:LdapNamingContext) {
        return $script:LdapNamingContext
    }

    $root = [ADSI]'LDAP://RootDSE'
    $script:LdapNamingContext = $root.defaultNamingContext
    return $script:LdapNamingContext
}

function Get-LdapDirectoryEntry {
    param([string]$SamAccountName)

    $context = Get-LdapNamingContext
    $searcher = New-Object System.DirectoryServices.DirectorySearcher
    $searcher.SearchRoot = [ADSI]"LDAP://$context"
    $searcher.Filter = "(sAMAccountName=$SamAccountName)"
    $searcher.PropertiesToLoad.AddRange(@(
        'displayName', 'mail', 'userPrincipalName', 'givenName', 'sn', 'cn', 'objectClass'
    )) | Out-Null

    $result = $searcher.FindOne()
    if (-not $result) { return $null }

    $entry = $result.Properties
    $classes = @($entry['objectClass'] | ForEach-Object { "$_" })
    $isGroup = $classes -contains 'group'

    $displayName = ($entry['displayName'] | Select-Object -First 1) -as [string]
    if (-not $displayName) {
        $displayName = ($entry['cn'] | Select-Object -First 1) -as [string]
    }

    $givenName = ($entry['givenName'] | Select-Object -First 1) -as [string]
    $surname = ($entry['sn'] | Select-Object -First 1) -as [string]
    if (-not $displayName -and ($givenName -or $surname)) {
        $displayName = "$givenName $surname".Trim()
    }

    $mail = ($entry['mail'] | Select-Object -First 1) -as [string]
    $upn = ($entry['userPrincipalName'] | Select-Object -First 1) -as [string]
    if (-not $mail -and $upn -match '@') {
        $mail = $upn
    }

    return @{
        MemberType        = if ($isGroup) { 'Group' } else { 'User' }
        DisplayName       = $displayName
        Email             = $mail
        UserPrincipalName = $upn
        GivenName         = $givenName
        Surname           = $surname
        LookupSource      = 'LDAP'
    }
}

function Get-AdModuleUserDetails {
    param([string]$SamAccountName)

    if (-not (Get-Command Get-ADUser -ErrorAction SilentlyContinue)) {
        if (Get-Module -ListAvailable -Name ActiveDirectory) {
            Import-Module ActiveDirectory -ErrorAction SilentlyContinue | Out-Null
        }
    }
    if (-not (Get-Command Get-ADUser -ErrorAction SilentlyContinue)) {
        return $null
    }

    try {
        $user = Get-ADUser -Identity $SamAccountName -Properties DisplayName, Mail, UserPrincipalName, GivenName, Surname -ErrorAction Stop
        $mail = $user.Mail
        if (-not $mail -and $user.UserPrincipalName -match '@') {
            $mail = $user.UserPrincipalName
        }

        return @{
            MemberType        = 'User'
            DisplayName       = $user.DisplayName
            Email             = $mail
            UserPrincipalName = $user.UserPrincipalName
            GivenName         = $user.GivenName
            Surname           = $user.Surname
            LookupSource      = 'Get-ADUser'
        }
    } catch {
        try {
            $group = Get-ADGroup -Identity $SamAccountName -Properties DisplayName, Mail -ErrorAction Stop
            return @{
                MemberType        = 'Group'
                DisplayName       = $group.DisplayName
                Email             = ($group.Mail -as [string])
                UserPrincipalName = $null
                GivenName         = $null
                Surname           = $null
                LookupSource      = 'Get-ADGroup'
            }
        } catch {
            return $null
        }
    }
}

function Get-NetUserFullName {
    param(
        [string]$SamAccountName,
        [string]$Domain
    )

    $output = & net.exe user $SamAccountName /domain 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) { return $null }

    foreach ($line in $output) {
        if ($line -match '^Full Name\s+(.+)$') {
            return $Matches[1].Trim()
        }
    }
    return $null
}

function Get-MemberUserDetails {
    param(
        [string]$Member,
        [string]$Domain,
        [string]$AccountName
    )

    $cacheKey = "$Domain\$AccountName".ToLowerInvariant()
    if ($script:UserDetailCache.ContainsKey($cacheKey)) {
        return $script:UserDetailCache[$cacheKey]
    }

    $details = Get-AdModuleUserDetails -SamAccountName $AccountName
    if (-not $details) {
        $details = Get-LdapDirectoryEntry -SamAccountName $AccountName
    }

    if (-not $details) {
        $fullName = Get-NetUserFullName -SamAccountName $AccountName -Domain $Domain
        if ($fullName) {
            $details = @{
                MemberType        = 'User'
                DisplayName       = $fullName
                Email             = $null
                UserPrincipalName = $null
                GivenName         = $null
                Surname           = $null
                LookupSource      = 'net user'
            }
        } else {
            $details = @{
                MemberType        = 'Unknown'
                DisplayName       = $null
                Email             = $null
                UserPrincipalName = $null
                GivenName         = $null
                Surname           = $null
                LookupSource      = 'unresolved'
            }
        }
    }

    $script:UserDetailCache[$cacheKey] = $details
    return $details
}

function Normalize-MemberRows {
    param([array]$Members)

    if ($Members.Count -eq 0) { return @() }

    $requested = $Members[0].GroupName
    $header = ($Members[0].GroupHeader -as [string]).Trim()
    $comment = ($Members[0].Comment -as [string]).Trim()

    $groupDisplayName = $null
    if ($header -and ($header -ine $requested)) {
        $groupDisplayName = $header
    }

    $groupDescription = $null
    if ($comment -and ($comment -ine $requested) -and (-not $header -or $comment -ine $header)) {
        $groupDescription = $comment
    }

    $normalized = @()
    foreach ($item in $Members) {
        $row = [ordered]@{
            GroupName = $requested
            Member    = $item.Member
        }

        if ($groupDisplayName) {
            $row['GroupDisplayName'] = $groupDisplayName
        }
        if ($groupDescription) {
            $row['GroupDescription'] = $groupDescription
        }

        foreach ($prop in @('Domain', 'SamAccountName', 'MemberType', 'DisplayName', 'Email',
                'UserPrincipalName', 'GivenName', 'Surname')) {
            if ($item.PSObject.Properties.Name -contains $prop) {
                $row[$prop] = $item.$prop
            }
        }

        $normalized += [pscustomobject]$row
    }

    return $normalized
}

function Get-GroupBannerText {
    param(
        [string]$RequestedName,
        [array]$Members
    )

    if ($Members.Count -eq 0) {
        return "Group: `"$RequestedName`""
    }

    $first = $Members[0]
    $parts = @("Group: `"$RequestedName`"")

    if ($first.PSObject.Properties.Name -contains 'GroupDisplayName' -and $first.GroupDisplayName) {
        $parts += "display=$($first.GroupDisplayName)"
    }
    if ($first.PSObject.Properties.Name -contains 'GroupDescription' -and $first.GroupDescription) {
        $parts += "description=$($first.GroupDescription)"
    }

    return ($parts -join '  |  ')
}

function Add-MemberUserDetails {
    param(
        [array]$Members,
        [switch]$SkipUserDetails
    )

    if ($SkipUserDetails) {
        return (Normalize-MemberRows -Members $Members)
    }

    $enriched = @()
    foreach ($item in $Members) {
        $identity = Split-MemberIdentity -Member $item.Member
        $details = Get-MemberUserDetails `
            -Member $item.Member `
            -Domain $identity.Domain `
            -AccountName $identity.AccountName

        $enriched += [pscustomobject]@{
            GroupName         = $item.GroupName
            GroupHeader       = $item.GroupHeader
            Comment           = $item.Comment
            Member            = $item.Member
            Domain            = $identity.Domain
            SamAccountName    = $identity.AccountName
            MemberType        = $details.MemberType
            DisplayName       = $details.DisplayName
            Email             = $details.Email
            UserPrincipalName = $details.UserPrincipalName
            GivenName         = $details.GivenName
            Surname           = $details.Surname
            LookupSource      = $details.LookupSource
            SourceCommand     = $item.SourceCommand
        }
    }
    return (Normalize-MemberRows -Members $enriched)
}

function ConvertFrom-LdapMemberDn {
    param([string]$MemberDn)

    try {
        $entry = New-Object System.DirectoryServices.DirectoryEntry("LDAP://$MemberDn")
        $sidBytes = $entry.Properties['objectSid'].Value
        if ($sidBytes) {
            $sid = New-Object System.Security.Principal.SecurityIdentifier($sidBytes, 0)
            $ntAccount = $sid.Translate([System.Security.Principal.NTAccount])
            return @{
                Member = ($ntAccount.Value -as [string])
            }
        }
    } catch {
        Write-Verbose "Could not resolve member DN '$MemberDn': $($_.Exception.Message)"
    }

    return @{
        Member = $MemberDn
    }
}

function Find-LdapGroupEntry {
    param([string]$GroupName)

    $context = Get-LdapNamingContext
    $escaped = Escape-LdapFilterValue -Value $GroupName
    $searcher = New-Object System.DirectoryServices.DirectorySearcher
    $searcher.SearchRoot = [ADSI]"LDAP://$context"
    $searcher.Filter = "(&(objectCategory=group)(|(sAMAccountName=$escaped)(cn=$escaped)(name=$escaped)))"
    $searcher.PropertiesToLoad.AddRange(@('member', 'cn', 'name', 'sAMAccountName', 'description')) | Out-Null

    $result = $searcher.FindOne()
    if (-not $result) { return $null }

    return @{
        DirectoryEntry = $result.GetDirectoryEntry()
        Header           = ($result.Properties['cn'] | Select-Object -First 1) -as [string]
        Comment          = ($result.Properties['description'] | Select-Object -First 1) -as [string]
    }
}

function Get-AdModuleGroupMemberRows {
    param(
        [string]$GroupName,
        [string]$SourceCommand
    )

    if (-not (Get-Command Get-ADGroup -ErrorAction SilentlyContinue)) {
        if (Get-Module -ListAvailable -Name ActiveDirectory) {
            Import-Module ActiveDirectory -ErrorAction SilentlyContinue | Out-Null
        }
    }
    if (-not (Get-Command Get-ADGroup -ErrorAction SilentlyContinue)) {
        return $null
    }

    $escaped = $GroupName.Replace("'", "''")
    $adGroup = Get-ADGroup -Filter "SamAccountName -eq '$escaped'" -ErrorAction SilentlyContinue
    if (-not $adGroup) {
        $adGroup = Get-ADGroup -Filter "Name -eq '$escaped'" -ErrorAction SilentlyContinue
    }
    if (-not $adGroup) { return $null }

    $domainNetBios = $env:USERDOMAIN
    try {
        $domainNetBios = (Get-ADDomain).NetBIOSName
    } catch {
        Write-Verbose "Get-ADDomain unavailable; using USERDOMAIN '$domainNetBios'."
    }

    $rows = @()
    Get-ADGroupMember -Identity $adGroup -ErrorAction Stop | ForEach-Object {
        $account = if ($_.SamAccountName) { "$domainNetBios\$($_.SamAccountName)" } else { $_.Name }
        $rows += [pscustomobject]@{
            GroupName     = $GroupName
            GroupHeader   = $adGroup.Name
            Comment       = ($adGroup.Description -as [string])
            Member        = $account
            SourceCommand = $SourceCommand
        }
    }
    return $rows
}

function Get-LdapGroupMemberRows {
    param(
        [string]$GroupName,
        [string]$SourceCommand
    )

    $group = Find-LdapGroupEntry -GroupName $GroupName
    if (-not $group) {
        throw "AD group '$GroupName' was not found via LDAP."
    }

    $memberDns = @($group.DirectoryEntry.Properties['member'] | ForEach-Object { "$_" })
    $rows = @()
    foreach ($memberDn in $memberDns) {
        if (-not $memberDn) { continue }
        $resolved = ConvertFrom-LdapMemberDn -MemberDn $memberDn
        $rows += [pscustomobject]@{
            GroupName     = $GroupName
            GroupHeader   = $group.Header
            Comment       = $group.Comment
            Member        = $resolved.Member
            SourceCommand = $SourceCommand
        }
    }
    return $rows
}

function Get-DirectoryGroupMemberRows {
    param([string]$GroupName)

    $adCommand = "Get-ADGroupMember $GroupName"
    $adRows = Get-AdModuleGroupMemberRows -GroupName $GroupName -SourceCommand $adCommand
    if ($adRows) {
        return @{
            Members       = $adRows
            LookupSource  = 'Get-ADGroupMember'
            SourceCommand = $adCommand
        }
    }

    $ldapCommand = "LDAP group lookup: $GroupName"
    return @{
        Members       = (Get-LdapGroupMemberRows -GroupName $GroupName -SourceCommand $ldapCommand)
        LookupSource  = 'LDAP'
        SourceCommand = $ldapCommand
    }
}

function Invoke-NetGroupDomain {
    param([string]$Group)

    $group = ($Group -as [string]).Trim()
    if (-not $group) {
        throw 'Group name is required.'
    }

    $commandText = "net group `"$group`" /domain"
    Write-Verbose $commandText

    $output = & net.exe group $group /domain 2>&1 | ForEach-Object { "$_" }
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0 -or (Test-NetGroupOutputFailed -Lines $output)) {
        $message = ($output -join [Environment]::NewLine).Trim()
        throw "net group failed for '$group' (exit $exitCode): $message"
    }

    return @{
        GroupName = $group
        Lines     = $output
        Command   = $commandText
    }
}

function ConvertFrom-NetGroupOutput {
    param(
        [string]$GroupName,
        [string[]]$Lines,
        [string]$SourceCommand
    )

    $members = @()
    $inMembers = $false
    $comment = $null
    $groupHeader = $null

    foreach ($line in $Lines) {
        $text = ($line -as [string]).TrimEnd()

        if ($text -match '^Group name\s+(.+)$') {
            $groupHeader = $Matches[1].Trim()
            continue
        }

        if ($text -match '^Comment\s*(.*)$') {
            $comment = $Matches[1].Trim()
            continue
        }

        if ($text -ieq 'Members') {
            $inMembers = $true
            continue
        }

        if ($text -match '^[-\\\/\s]+$') {
            continue
        }

        if ($text -match '^The command completed successfully') {
            break
        }

        if (-not $inMembers) {
            continue
        }

        $member = $text.Trim()
        if (-not $member) { continue }

        $members += [pscustomobject]@{
            GroupName     = $GroupName
            GroupHeader   = $groupHeader
            Comment       = $comment
            Member        = $member
            SourceCommand = $SourceCommand
        }
    }

    if ($members.Count -eq 0) {
        Write-Warning "Group '$GroupName' has no members (or could not parse output)."
    }

    return $members
}

function Get-GroupMembers {
    param(
        [string]$Group,
        [switch]$SkipUserDetails
    )

    $group = ($Group -as [string]).Trim()
    $members = $null
    $method = $null
    $lookupSource = $null
    $sourceCommand = $null
    $ldapError = $null

    try {
        $directoryResult = Get-DirectoryGroupMemberRows -GroupName $group
        $members = $directoryResult.Members
        $method = 'LDAP/AD'
        $lookupSource = $directoryResult.LookupSource
        $sourceCommand = $directoryResult.SourceCommand
    } catch {
        $ldapError = $_.Exception.Message
        Write-Verbose "LDAP/AD lookup failed for '$group': $ldapError"
    }

    if (-not $members -and $group.Length -le $script:NetGroupNameMaxLength) {
        try {
            $result = Invoke-NetGroupDomain -Group $group
            $members = ConvertFrom-NetGroupOutput `
                -GroupName $result.GroupName `
                -Lines $result.Lines `
                -SourceCommand $result.Command
            $method = 'net group /domain'
            $lookupSource = 'net group'
            $sourceCommand = $result.Command
        } catch {
            $netError = $_.Exception.Message
            if ($ldapError) {
                throw "Group '$group' not found via LDAP/AD ($ldapError) and net group failed ($netError)"
            }
            throw
        }
    }

    if (-not $members) {
        if ($ldapError) {
            throw "Group '$group' not found via LDAP/AD: $ldapError"
        }
        throw "Group '$group' has no members or could not be resolved."
    }

    $members = Add-MemberUserDetails -Members $members -SkipUserDetails:$SkipUserDetails
    return @{
        Members       = $members
        Method        = $method
        LookupSource  = $lookupSource
        SourceCommand = $sourceCommand
    }
}

function Get-NetGroupMembers {
    param(
        [string]$Group,
        [switch]$SkipUserDetails
    )

    return (Get-GroupMembers -Group $Group -SkipUserDetails:$SkipUserDetails).Members
}

function Format-MemberLine {
    param([object]$MemberRow)

    if ($MemberRow.DisplayName -or $MemberRow.Email) {
        $name = if ($MemberRow.DisplayName) { $MemberRow.DisplayName } else { '-' }
        $email = if ($MemberRow.Email) { $MemberRow.Email } else { '-' }
        return "  $($MemberRow.Member)  |  $name  |  $email"
    }

    return "  $($MemberRow.Member)"
}

# --- Main ---

$groups = if ($PSCmdlet.ParameterSetName -eq 'ByFile') {
    Read-GroupNameList -Path $GroupListFile
} else {
    @($GroupName | ForEach-Object { ($_ -as [string]).Trim() } | Where-Object { $_ })
}

if ($groups.Count -eq 0) {
    throw 'At least one group name is required.'
}

$allMembers = @()
$failures = @()
$groupSummaries = @()

foreach ($group in $groups) {
    try {
        $result = Get-GroupMembers -Group $group -SkipUserDetails:$SkipUserDetails
        $members = @($result.Members)
        $allMembers += $members

        $groupSummaries += [pscustomobject]@{
            GroupName     = $group
            MemberCount   = $members.Count
            Method        = $result.Method
            LookupSource  = $result.LookupSource
            SourceCommand = $result.SourceCommand
            UserCount     = @($members | Where-Object { $_.MemberType -eq 'User' }).Count
            WithEmail     = @($members | Where-Object { $_.Email }).Count
        }

        Write-Host "==== $(Get-GroupBannerText -RequestedName $group -Members $members) ===="
        Write-Host "  LookupSource  : $($result.LookupSource)"
        Write-Host "  SourceCommand : $($result.SourceCommand)"
        Write-Host "  Members       : $($members.Count)"

        if ($members.Count -eq 0) {
            Write-Host '  (no members)'
        } else {
            $members | ForEach-Object { Write-Host (Format-MemberLine -MemberRow $_) }
        }
    } catch {
        $failures += [pscustomobject]@{
            GroupName = $group
            Error     = $_.Exception.Message
        }
        Write-Warning "Group `"$group`" failed: $($_.Exception.Message)"
    }
    Write-Host ''
}

if ($OutputPath) {
    $dir = Split-Path -Parent $OutputPath
    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $allMembers | Export-Csv -LiteralPath $OutputPath -NoTypeInformation -Encoding UTF8
    Write-Host "Wrote $($allMembers.Count) member row(s) to $OutputPath"
}

$userCount = @($allMembers | Where-Object { $_.MemberType -eq 'User' }).Count
$withEmail = @($allMembers | Where-Object { $_.Email }).Count

Write-Host '==== Summary ===='
Write-Host "  Groups requested : $($groups.Count)"
Write-Host "  Groups succeeded : $($groupSummaries.Count)"
Write-Host "  Groups failed    : $($failures.Count)"
Write-Host "  Members found    : $($allMembers.Count)"
if (-not $SkipUserDetails) {
    Write-Host "  Users resolved   : $userCount"
    Write-Host "  With email       : $withEmail"
}
if ($OutputPath) {
    Write-Host "  Output file      : $OutputPath"
}

if ($groupSummaries.Count -gt 0) {
    Write-Host ''
    Write-Host 'Groups (once):'
    foreach ($item in $groupSummaries) {
        Write-Host "  - $($item.GroupName)"
        Write-Host "      LookupSource  : $($item.LookupSource)"
        Write-Host "      SourceCommand : $($item.SourceCommand)"
        $detail = "members=$($item.MemberCount)"
        if (-not $SkipUserDetails) {
            $detail += ", users=$($item.UserCount), with-email=$($item.WithEmail)"
        }
        Write-Host "      $detail"
    }
}

if ($failures.Count -gt 0) {
    Write-Host ''
    Write-Host 'Failed groups:'
    foreach ($item in $failures) {
        Write-Host "  - $($item.GroupName): $($item.Error)"
    }
}

if ($PassThru -or (-not $OutputPath)) {
    $allMembers
}

if ($failures.Count -gt 0 -and $allMembers.Count -eq 0) {
    exit 1
}
