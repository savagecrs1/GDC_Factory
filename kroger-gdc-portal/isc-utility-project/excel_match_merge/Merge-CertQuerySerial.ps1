#Requires -Version 5.1
<#
.SYNOPSIS
    Copy Serial number values into a CertQuery export by matching key columns.

.DESCRIPTION
    Reads Serial number from a source CertQuery file and writes it into a target
    CertQuery file where Issued DN, Effective Date, and Expiration Date match.

    When multiple source rows share the same key (different serials), serials are assigned
    to target rows in source file order (one serial per matching target row).

    When the default serial export is missing, the script falls back to an existing
    *-with-serial.csv or CertQuery-merged.csv in the same folder (if present).

.PARAMETER SerialSourcePath
    File containing Serial number column. Default: CertQuery-2026-06-11_with_serial.csv

.PARAMETER TargetPath
    CertQuery file to update. Default: CertQuery-2026-06-10T14-14_03-074.csv

.PARAMETER OutputPath
    Output path. Default: <TargetBase>-with-serial.csv beside the target file.

.PARAMETER IssuedDnColumn
    Match column for issued DN. Default: Issued DN

.PARAMETER EffectiveDateColumn
    Match column for effective date. Default: Effective Date

.PARAMETER ExpirationDateColumn
    Match column for expiration date. Default: Expiration Date

.PARAMETER SerialColumn
    Serial column name in source file (case-insensitive). Output column is always
    "Serial Number" as the first column. Default: Serial number

.PARAMETER NoMatchValue
    Value written when no source row matches. Default: No Matching

.EXAMPLE
    cd c:\kroger_isc_projects\isc-utility-project\excel_match_merge
    .\Merge-CertQuerySerial.ps1

.EXAMPLE
    .\Merge-CertQuerySerial.ps1 `
        -SerialSourcePath .\CertQuery-2026-06-11_with_serial.csv `
        -TargetPath .\CertQuery-2026-06-10T14-14_03-074.csv `
        -OutputPath .\CertQuery-merged.csv
#>

[CmdletBinding()]
param(
    [string]$SerialSourcePath,

    [string]$TargetPath,

    [string]$OutputPath,

    [string]$IssuedDnColumn = 'Issued DN',

    [string]$EffectiveDateColumn = 'Effective Date',

    [string]$ExpirationDateColumn = 'Expiration Date',

    [string]$SerialColumn = 'Serial number',

    [string]$NoMatchValue = 'No Matching'
)

$ErrorActionPreference = 'Stop'

$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $SerialSourcePath) {
    $SerialSourcePath = Join-Path $scriptDir 'CertQuery-2026-06-11_with_serial.csv'
}
if (-not $TargetPath) {
    $TargetPath = Join-Path $scriptDir 'CertQuery-2026-06-10T14-14_03-074.csv'
}

function Resolve-InputPath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw 'Input path is required.'
    }

    $candidates = New-Object System.Collections.Generic.List[string]
    [void]$candidates.Add($Path)

    if (-not [System.IO.Path]::IsPathRooted($Path)) {
        [void]$candidates.Add((Join-Path (Get-Location).Path $Path))
        if ($scriptDir) {
            [void]$candidates.Add((Join-Path $scriptDir $Path))
            [void]$candidates.Add((Join-Path $scriptDir (Split-Path -Leaf $Path)))
        }
    }

    $seen = @{}
    foreach ($candidate in $candidates) {
        $normalized = [System.IO.Path]::GetFullPath($candidate)
        if ($seen.ContainsKey($normalized)) { continue }
        $seen[$normalized] = $true
        if (Test-Path -LiteralPath $normalized) {
            return (Resolve-Path -LiteralPath $normalized).Path
        }
    }

    $folderFiles = @()
    if ($scriptDir -and (Test-Path -LiteralPath $scriptDir)) {
        $folderFiles = @(Get-ChildItem -LiteralPath $scriptDir -File | ForEach-Object { $_.Name })
    }

    $message = "File not found: $Path"
    if ($folderFiles.Count -gt 0) {
        $message += "`nFiles in $(Split-Path -Leaf $scriptDir) folder:"
        foreach ($name in $folderFiles) {
            $message += "`n  - $name"
        }
    }
    if ($Path -match 'with_serial') {
        $message += "`n`nPlace CertQuery-2026-06-11_with_serial.csv in:`n  $scriptDir"
    }
    throw $message
}

function Test-InputPathExists {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }

    $candidates = New-Object System.Collections.Generic.List[string]
    [void]$candidates.Add($Path)
    if (-not [System.IO.Path]::IsPathRooted($Path)) {
        [void]$candidates.Add((Join-Path (Get-Location).Path $Path))
        if ($scriptDir) {
            [void]$candidates.Add((Join-Path $scriptDir $Path))
            [void]$candidates.Add((Join-Path $scriptDir (Split-Path -Leaf $Path)))
        }
    }

    foreach ($candidate in $candidates) {
        $normalized = [System.IO.Path]::GetFullPath($candidate)
        if (Test-Path -LiteralPath $normalized) { return $true }
    }
    return $false
}

function Resolve-SerialSourcePath {
    param(
        [string]$RequestedPath,
        [string]$TargetFileName
    )

    if (Test-InputPathExists -Path $RequestedPath) {
        return (Resolve-InputPath -Path $RequestedPath)
    }

    if (-not $scriptDir -or -not (Test-Path -LiteralPath $scriptDir)) {
        throw "Serial source not found: $RequestedPath"
    }

    $fallback = Get-ChildItem -LiteralPath $scriptDir -File | Where-Object {
        ($_.Name -like '*with_serial*' -or $_.Name -like '*-with-serial.csv' -or $_.Name -eq 'CertQuery-merged.csv') -and
        ($_.Name -ne $TargetFileName) -and
        ($_.Name -ne 'Merge-CertQuerySerial.ps1')
    } | Sort-Object {
        if ($_.Name -like '*with_serial*') { 0 }
        elseif ($_.Name -like '*-with-serial.csv') { 1 }
        else { 2 }
    } | Select-Object -First 1

    if ($fallback) {
        Write-Warning "Serial source not found: $RequestedPath"
        Write-Warning "Using fallback serial source: $($fallback.Name)"
        return $fallback.FullName
    }

    $folderFiles = @(Get-ChildItem -LiteralPath $scriptDir -File | ForEach-Object { $_.Name })
    $message = @(
        "Serial source not found: $RequestedPath"
        "Files in $(Split-Path -Leaf $scriptDir) folder:"
    )
    foreach ($name in $folderFiles) { $message += "  - $name" }
    $message += ""
    $message += "Restore CertQuery-2026-06-11_with_serial.csv to:"
    $message += "  $scriptDir"
    $message += ""
    $message += "Or pass an existing file that has Serial number, e.g.:"
    $message += "  -SerialSourcePath .\CertQuery-2026-06-10T14-14_03-074-with-serial.csv"
    throw ($message -join [Environment]::NewLine)
}

function Test-IsXlsxPackage {
    param([string]$Path)

    $fs = [System.IO.File]::OpenRead($Path)
    try {
        $buf = New-Object byte[] 2
        $read = $fs.Read($buf, 0, 2)
        return ($read -eq 2 -and $buf[0] -eq 0x50 -and $buf[1] -eq 0x4B)
    } finally {
        $fs.Dispose()
    }
}

function ConvertFrom-ExcelColumnName {
    param([string]$ColumnLetters)

    $sum = 0
    foreach ($ch in $ColumnLetters.ToUpperInvariant().ToCharArray()) {
        if ($ch -lt 'A' -or $ch -gt 'Z') { continue }
        $sum = ($sum * 26) + ([int][char]$ch - [int][char]'A' + 1)
    }
    return ($sum - 1)
}

function Read-XlsxFirstSheetRows {
    param([string]$Path)

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    $nsm = New-Object System.Xml.XmlNamespaceManager((New-Object System.Xml.NameTable))
    $nsm.AddNamespace('m', $ns)

    $zip = [System.IO.Compression.ZipFile]::OpenRead($Path)
    try {
        $shared = New-Object System.Collections.Generic.List[string]
        $ssEntry = $zip.GetEntry('xl/sharedStrings.xml')
        if ($ssEntry) {
            $sr = New-Object System.IO.StreamReader($ssEntry.Open())
            try {
                $ssXml = [xml]$sr.ReadToEnd()
            } finally {
                $sr.Dispose()
            }
            foreach ($si in $ssXml.SelectNodes('//m:si', $nsm)) {
                $parts = $si.SelectNodes('.//m:t', $nsm) | ForEach-Object { $_.InnerText }
                [void]$shared.Add(($parts -join ''))
            }
        }

        $sheetEntry = $zip.Entries |
            Where-Object { $_.FullName -match '^xl/worksheets/sheet1\.xml$' } |
            Select-Object -First 1
        if (-not $sheetEntry) {
            throw "XLSX workbook has no xl/worksheets/sheet1.xml"
        }

        $sheetReader = New-Object System.IO.StreamReader($sheetEntry.Open())
        try {
            $sheetXml = [xml]$sheetReader.ReadToEnd()
        } finally {
            $sheetReader.Dispose()
        }

        $grid = @{}
        $maxRow = 0
        $maxCol = 0

        foreach ($rowNode in $sheetXml.SelectNodes('//m:sheetData/m:row', $nsm)) {
            $rowIndex = [int]$rowNode.GetAttribute('r') - 1
            if ($rowIndex -lt 0) { continue }
            if ($rowIndex -gt $maxRow) { $maxRow = $rowIndex }

            foreach ($cell in $rowNode.SelectNodes('m:c', $nsm)) {
                $ref = $cell.GetAttribute('r')
                if (-not $ref) { continue }
                if ($ref -notmatch '^([A-Z]+)(\d+)$') { continue }
                $colIndex = ConvertFrom-ExcelColumnName -ColumnLetters $Matches[1]
                if ($colIndex -gt $maxCol) { $maxCol = $colIndex }

                $valueNode = $cell.SelectSingleNode('m:v', $nsm)
                if (-not $valueNode) { continue }
                $raw = $valueNode.InnerText
                if ($cell.GetAttribute('t') -eq 's') {
                    $raw = $shared[[int]$raw]
                }
                if (-not $grid.ContainsKey($rowIndex)) {
                    $grid[$rowIndex] = @{}
                }
                $grid[$rowIndex][$colIndex] = $raw
            }
        }

        if ($maxRow -lt 1) { return @() }

        $headers = @{}
        for ($c = 0; $c -le $maxCol; $c++) {
            $name = $grid[0][$c]
            if ([string]::IsNullOrWhiteSpace($name)) { continue }
            $headers[$c] = ($name -as [string]).Trim()
        }

        $rows = New-Object System.Collections.Generic.List[object]
        for ($r = 1; $r -le $maxRow; $r++) {
            if (-not $grid.ContainsKey($r)) { continue }
            $obj = [ordered]@{}
            $hasData = $false
            foreach ($c in ($headers.Keys | Sort-Object { [int]$_ })) {
                $header = $headers[$c]
                $val = $grid[$r][$c]
                if ($null -eq $val) { $val = '' }
                else { $hasData = $true }
                $obj[$header] = $val
            }
            if ($hasData) {
                [void]$rows.Add([pscustomobject]$obj)
            }
        }
        return @($rows.ToArray())
    } finally {
        $zip.Dispose()
    }
}

function Import-SpreadsheetRows {
    param([string]$Path)

    if (Test-IsXlsxPackage -Path $Path) {
        Write-Host "Detected Excel workbook: $Path"
        return @(Read-XlsxFirstSheetRows -Path $Path)
    }

    return @(Import-Csv -LiteralPath $Path)
}

function Resolve-ColumnName {
    param(
        [object]$Row,
        [string]$PreferredName
    )

    if (-not $Row) { return $null }
    $target = ($PreferredName -as [string]).Trim()
    foreach ($prop in $Row.PSObject.Properties.Name) {
        if (($prop -as [string]).Trim() -ieq $target) {
            return $prop
        }
    }
    return $null
}

function Get-RowValue {
    param(
        [object]$Row,
        [string]$ColumnName
    )

    if (-not $Row -or -not $ColumnName) { return '' }
    $resolved = Resolve-ColumnName -Row $Row -PreferredName $ColumnName
    if (-not $resolved) { return '' }
    return (($Row.$resolved -as [string]).Trim())
}

function Set-RowValue {
    param(
        [object]$Row,
        [string]$ColumnName,
        [string]$Value
    )

    $resolved = Resolve-ColumnName -Row $Row -PreferredName $ColumnName
    if ($resolved) {
        $Row.$resolved = $Value
    } else {
        $Row | Add-Member -NotePropertyName $ColumnName -NotePropertyValue $Value -Force
    }
}

function Normalize-MatchText {
    param([object]$Value)

    if ($null -eq $Value) { return '' }
    return (($Value -as [string]).Trim())
}

function Normalize-MatchDate {
    param([object]$Value)

    if ($null -eq $Value) { return '' }
    if ($Value -is [datetime]) {
        return $Value.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss')
    }

    $text = ($Value -as [string]).Trim()
    if (-not $text) { return '' }

    $styles = @(
        'yyyy-MM-ddTHH:mm:ss.fffffff',
        'yyyy-MM-ddTHH:mm:ss.ffffff',
        'yyyy-MM-ddTHH:mm:ss.fff',
        'yyyy-MM-ddTHH:mm:ssZ',
        'yyyy-MM-ddTHH:mm:ss.fffZ',
        'yyyy-MM-ddTHH:mm:ss',
        'yyyy-MM-dd',
        'M/d/yyyy h:mm:ss tt',
        'M/d/yyyy'
    )

    $culture = [System.Globalization.CultureInfo]::InvariantCulture
    $stylesEnum = [System.Globalization.DateTimeStyles]::AssumeUniversal
    $parsed = [datetime]::MinValue
    foreach ($style in $styles) {
        if ([datetime]::TryParseExact($text, $style, $culture, $stylesEnum, [ref]$parsed)) {
            return $parsed.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss')
        }
    }
    if ([datetime]::TryParse($text, [ref]$parsed)) {
        return $parsed.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss')
    }

    return $text
}

function Get-MatchKey {
    param(
        [object]$Row,
        [string]$DnColumn,
        [string]$EffectiveColumn,
        [string]$ExpirationColumn
    )

    $dn = Normalize-MatchText -Value (Get-RowValue -Row $Row -ColumnName $DnColumn)
    $eff = Normalize-MatchDate -Value (Get-RowValue -Row $Row -ColumnName $EffectiveColumn)
    $exp = Normalize-MatchDate -Value (Get-RowValue -Row $Row -ColumnName $ExpirationColumn)

    if (-not $dn -and -not $eff -and -not $exp) { return $null }
    return "$dn|$eff|$exp"
}

function Build-SerialLookup {
    param(
        [object[]]$Rows,
        [string]$DnColumn,
        [string]$EffectiveColumn,
        [string]$ExpirationColumn,
        [string]$SerialColumnName
    )

    $lookup = @{}
    $duplicateKeys = New-Object System.Collections.Generic.List[string]
    $missingSerial = 0

    foreach ($row in $Rows) {
        $key = Get-MatchKey -Row $row -DnColumn $DnColumn -EffectiveColumn $EffectiveColumn -ExpirationColumn $ExpirationColumn
        if (-not $key) { continue }

        $serial = Get-RowValue -Row $row -ColumnName $SerialColumnName
        if (-not $serial) {
            $missingSerial++
            continue
        }

        if (-not $lookup.ContainsKey($key)) {
            $lookup[$key] = New-Object System.Collections.Generic.List[string]
        } elseif ($lookup[$key].Count -gt 0 -and $lookup[$key][-1] -ine $serial) {
            [void]$duplicateKeys.Add($key)
        }

        [void]$lookup[$key].Add($serial)
    }

    return @{
        Lookup        = $lookup
        DuplicateKeys = @($duplicateKeys | Select-Object -Unique)
        MissingSerial = $missingSerial
    }
}

function Get-NextSerialForKey {
    param(
        [string]$Key,
        [hashtable]$Lookup,
        [hashtable]$IndexByKey
    )

    if (-not $Key -or -not $Lookup.ContainsKey($Key)) { return $null }

    $serials = $Lookup[$Key]
    if ($serials.Count -eq 0) { return $null }

    $index = 0
    if ($IndexByKey.ContainsKey($Key)) {
        $index = $IndexByKey[$Key]
    }

    if ($index -ge $serials.Count) { return $null }

    $IndexByKey[$Key] = $index + 1
    return $serials[$index]
}

function Get-TargetColumnOrder {
    param([object[]]$Rows)

    if ($Rows.Count -eq 0) { return @() }
    return @($Rows[0].PSObject.Properties | ForEach-Object { $_.Name })
}

function Test-IsSerialColumnName {
    param(
        [string]$ColumnName,
        [string]$OutputSerialColumn,
        [string]$SourceSerialColumn
    )

    if (-not $ColumnName) { return $false }
    return (
        ($ColumnName -ieq $OutputSerialColumn) -or
        ($ColumnName -ieq $SourceSerialColumn) -or
        ($ColumnName -ieq 'Serial number') -or
        ($ColumnName -ieq 'Serial Number')
    )
}

function New-MergedOutputRow {
    param(
        [object]$TargetRow,
        [string[]]$TargetColumnOrder,
        [string]$SerialValue,
        [string]$OutputSerialColumn,
        [string]$SourceSerialColumn
    )

    $ordered = [ordered]@{}
    $ordered[$OutputSerialColumn] = $SerialValue

    foreach ($col in $TargetColumnOrder) {
        if (Test-IsSerialColumnName -ColumnName $col -OutputSerialColumn $OutputSerialColumn -SourceSerialColumn $SourceSerialColumn) {
            continue
        }
        $ordered[$col] = Get-RowValue -Row $TargetRow -ColumnName $col
    }

    return [pscustomobject]$ordered
}

# --- Main ---

$targetLeaf = Split-Path -Leaf $TargetPath
$SerialSourcePath = Resolve-SerialSourcePath -RequestedPath $SerialSourcePath -TargetFileName $targetLeaf
$TargetPath = Resolve-InputPath -Path $TargetPath

$sourceRows = Import-SpreadsheetRows -Path $SerialSourcePath
$targetRows = Import-SpreadsheetRows -Path $TargetPath

if ($sourceRows.Count -eq 0) { throw 'Serial source file has no data rows.' }
if ($targetRows.Count -eq 0) { throw 'Target file has no data rows.' }

$sample = $sourceRows[0]
foreach ($required in @($IssuedDnColumn, $EffectiveDateColumn, $ExpirationDateColumn, $SerialColumn)) {
    if (-not (Resolve-ColumnName -Row $sample -PreferredName $required)) {
        throw "Column '$required' not found in serial source file."
    }
}

$targetSample = $targetRows[0]
foreach ($required in @($IssuedDnColumn, $EffectiveDateColumn, $ExpirationDateColumn)) {
    if (-not (Resolve-ColumnName -Row $targetSample -PreferredName $required)) {
        throw "Column '$required' not found in target file."
    }
}

$serialLookupResult = Build-SerialLookup `
    -Rows $sourceRows `
    -DnColumn $IssuedDnColumn `
    -EffectiveColumn $EffectiveDateColumn `
    -ExpirationColumn $ExpirationDateColumn `
    -SerialColumnName $SerialColumn

$lookup = $serialLookupResult.Lookup
$serialIndexByKey = @{}
$outputSerialColumn = 'Serial Number'
$targetColumnOrder = Get-TargetColumnOrder -Rows $targetRows
$matched = 0
$unmatched = 0
$unmatchedRows = New-Object System.Collections.Generic.List[object]
$merged = foreach ($row in $targetRows) {
    $key = Get-MatchKey -Row $row -DnColumn $IssuedDnColumn -EffectiveColumn $EffectiveDateColumn -ExpirationColumn $ExpirationDateColumn
    $serial = Get-NextSerialForKey -Key $key -Lookup $lookup -IndexByKey $serialIndexByKey
    if ($serial) {
        $serialValue = $serial
        $matched++
    } else {
        $serialValue = $NoMatchValue
        $unmatched++
        [void]$unmatchedRows.Add([pscustomobject]@{
            IssuedDn        = Get-RowValue -Row $row -ColumnName $IssuedDnColumn
            EffectiveDate   = Get-RowValue -Row $row -ColumnName $EffectiveDateColumn
            ExpirationDate  = Get-RowValue -Row $row -ColumnName $ExpirationDateColumn
            MatchKey        = $key
        })
    }

    New-MergedOutputRow `
        -TargetRow $row `
        -TargetColumnOrder $targetColumnOrder `
        -SerialValue $serialValue `
        -OutputSerialColumn $outputSerialColumn `
        -SourceSerialColumn $SerialColumn
}

$totalSourceSerials = 0
foreach ($key in $lookup.Keys) { $totalSourceSerials += $lookup[$key].Count }

if (-not $OutputPath) {
    $base = [System.IO.Path]::GetFileNameWithoutExtension($TargetPath)
    if ($base -match '\.csv$') { $base = [System.IO.Path]::GetFileNameWithoutExtension($base) }
    $OutputPath = Join-Path (Split-Path -Parent $TargetPath) "${base}-with-serial.csv"
}

$merged | Export-Csv -LiteralPath $OutputPath -NoTypeInformation -Encoding UTF8

Write-Host ''
Write-Host '==== Merge-CertQuerySerial Summary ===='
Write-Host "  Serial source : $SerialSourcePath"
Write-Host "  Target file   : $TargetPath"
Write-Host "  Output file   : $OutputPath"
Write-Host ''
Write-Host 'Match columns:'
Write-Host "  $IssuedDnColumn"
Write-Host "  $EffectiveDateColumn"
Write-Host "  $ExpirationDateColumn"
Write-Host ''
Write-Host "  Source serial rows  : $totalSourceSerials"
Write-Host "  Source unique keys  : $($lookup.Count)"
Write-Host "  Source rows no serial   : $($serialLookupResult.MissingSerial)"
Write-Host "  Target rows matched     : $matched"
Write-Host "  Target rows no match    : $unmatched (Serial Number = '$NoMatchValue')"
if ($serialLookupResult.DuplicateKeys.Count -gt 0) {
    Write-Host "  Multi-serial keys       : $($serialLookupResult.DuplicateKeys.Count) (serials assigned in source row order)"
}

if ($unmatchedRows.Count -gt 0) {
    Write-Host ''
    Write-Host 'Unmatched target rows:'
    foreach ($item in $unmatchedRows) {
        Write-Host "  - $($item.IssuedDn)"
        Write-Host "      Effective: $($item.EffectiveDate)  Expiration: $($item.ExpirationDate)"
    }
}
Write-Host ''
Write-Host 'Done.'
