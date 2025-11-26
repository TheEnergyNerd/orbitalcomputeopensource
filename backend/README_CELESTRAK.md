# Checking CelesTrak TLEs

## Quick Check Script

Run the check script:
```bash
cd backend
python3 check_celestrak.py
```

This will:
- Test all CelesTrak endpoints
- Count how many Starlink satellites are available
- Save TLEs to cache if successful
- Show sample TLE data

## Manual Download (if script fails)

If the script times out, you can manually download TLEs:

### Option 1: Using curl (if it works)
```bash
cd backend
curl -H "User-Agent: Mozilla/5.0" "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle" > tle_cache.txt
echo $(date +%s) > tle_cache_time.txt
```

### Option 2: Using browser
1. Open: https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle
2. Save the page as `tle_cache.txt` in the `backend/` directory
3. Create `tle_cache_time.txt` with current timestamp:
   ```bash
   echo $(date +%s) > backend/tle_cache_time.txt
   ```

### Option 3: Alternative endpoint
Try: https://celestrak.org/NORAD/elements/starlink.txt

## Expected Results

- **Starlink satellites**: Should be ~8,000-9,000 satellites
- **File size**: ~500KB - 1MB
- **Format**: Each satellite has 3 lines (name, TLE line 1, TLE line 2)

## Verifying Cache

After downloading, verify the cache:
```bash
cd backend
python3 -c "
with open('tle_cache.txt', 'r') as f:
    lines = f.read().strip().split('\n')
    tle_count = sum(1 for i in range(0, len(lines)-1, 3) 
                    if i+2 < len(lines) and lines[i+1].startswith('1 ') and lines[i+2].startswith('2 '))
    print(f'Cached satellites: {tle_count}')
"
```

## Troubleshooting

If CelesTrak is timing out:
1. Check your internet connection
2. Try from a different network
3. Check if CelesTrak is accessible: https://celestrak.org
4. Wait a few minutes and try again (rate limiting)
5. Use manual download option above

