param([Parameter(Mandatory=$true)][string]$SourceDirectory,[Parameter(Mandatory=$true)][string]$ArchiveFile)
$ErrorActionPreference='Stop'
$taskSource=(Resolve-Path -LiteralPath $SourceDirectory).Path
$taskArchive=[IO.Path]::GetFullPath($ArchiveFile)
if (Test-Path -LiteralPath $taskArchive) { throw 'Archive already exists. Choose a new destination.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($taskSource,$taskArchive,[IO.Compression.CompressionLevel]::Optimal,$true)
Get-Item -LiteralPath $taskArchive | Select-Object FullName,Length
