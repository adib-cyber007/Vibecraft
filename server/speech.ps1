param([ValidateSet('voices','speak')][string]$Mode, [string]$InputJson, [string]$OutputWav)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Speech
$synthesizer = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
    if ($Mode -eq 'voices') {
        $voices = @($synthesizer.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object {
            @{ name = $_.VoiceInfo.Name; language = $_.VoiceInfo.Culture.Name }
        })
        ConvertTo-Json -InputObject $voices -Compress
    } else {
        $request = Get-Content -LiteralPath $InputJson -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($request.voice) { $synthesizer.SelectVoice([string]$request.voice) }
        $synthesizer.Rate = [int]$request.rate
        $synthesizer.SetOutputToWaveFile($OutputWav)
        $synthesizer.Speak([string]$request.text)
        $synthesizer.SetOutputToNull()
    }
} finally {
    $synthesizer.Dispose()
}
