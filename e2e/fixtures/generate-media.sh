#!/usr/bin/env bash
# Regenerates the tiny synthetic media used by the browser tests (already committed — only needed if you change them).
# Needs an ffmpeg with libvpx-vp9 + libopus:  FFMPEG=/path/to/ffmpeg bash e2e/fixtures/generate-media.sh
set -euo pipefail
FF="${FFMPEG:-ffmpeg}"
cd "$(dirname "$0")/media"
rm -rf hls sample.webm && mkdir hls

# 1) progressive WebM (VP9 + Opus), 12 s
$FF -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=480x270:rate=25:duration=12" -f lavfi -i "sine=frequency=440:duration=12" \
  -c:v libvpx-vp9 -b:v 90k -deadline realtime -cpu-used 8 -g 25 -c:a libopus -b:a 32k -shortest sample.webm

# 2) HLS with two video qualities and two subtitle tracks (fMP4 segments, video only)
cd hls
for spec in "v360:480x270:110k" "v180:320x180:50k"; do
  IFS=: read -r name size rate <<<"$spec"
  $FF -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=$size:rate=25:duration=12" -c:v libvpx-vp9 -b:v "$rate" -deadline realtime -cpu-used 8 -g 50 -an \
    -f hls -hls_time 2 -hls_playlist_type vod -hls_segment_type fmp4 -hls_fmp4_init_filename "${name}_init.mp4" -hls_segment_filename "${name}_%03d.m4s" "$name.m3u8"
done
cat > master.m3u8 <<'M3U'
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",DEFAULT=NO,AUTOSELECT=YES,URI="subs_en.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Español",LANGUAGE="es",DEFAULT=NO,AUTOSELECT=YES,URI="subs_es.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=200000,RESOLUTION=480x270,CODECS="vp09.00.10.08",SUBTITLES="subs"
v360.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=90000,RESOLUTION=320x180,CODECS="vp09.00.10.08",SUBTITLES="subs"
v180.m3u8
M3U
for lang in en es; do
  cat > "subs_$lang.m3u8" <<M3U
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:12
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:12.0,
subs_$lang.vtt
#EXT-X-ENDLIST
M3U
done
printf 'WEBVTT\n\n00:00:00.500 --> 00:00:11.000\nHello from the English subtitles\n' > subs_en.vtt
printf 'WEBVTT\n\n00:00:00.500 --> 00:00:11.000\nHola desde los subtítulos en español\n' > subs_es.vtt
