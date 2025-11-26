#!/usr/bin/env python3
"""
Script to check CelesTrak TLE availability and download Starlink TLEs
"""
import asyncio
import httpx
from pathlib import Path

async def check_celestrak():
    """Check if CelesTrak is accessible and count Starlink satellites"""
    urls = [
        "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle",
        "https://celestrak.org/NORAD/elements/starlink.txt",
        "https://celestrak.org/api/v1/gp.php?GROUP=starlink&FORMAT=tle",
    ]
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/plain",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://celestrak.org/",
    }
    
    print("Checking CelesTrak endpoints...")
    print("=" * 60)
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        for url in urls:
            try:
                print(f"\nTrying: {url}")
                response = await client.get(url, headers=headers, follow_redirects=True)
                response.raise_for_status()
                
                text = response.text.strip()
                
                # Check if we got HTML (403 page) instead of TLE data
                if text.startswith("<!DOCTYPE") or text.startswith("<html") or "403" in text or "Forbidden" in text:
                    print(f"  ❌ Got 403 Forbidden (HTML page)")
                    continue
                
                # Parse TLEs
                lines = text.split("\n")
                print(f"  ✓ Got {len(lines)} lines")
                
                # Count TLE sets (3 lines each: name, line1, line2)
                tle_count = 0
                valid_tles = []
                for i in range(0, len(lines) - 1, 3):
                    if i + 2 < len(lines):
                        name = lines[i].strip()
                        line1 = lines[i + 1].strip()
                        line2 = lines[i + 2].strip()
                        if line1.startswith("1 ") and line2.startswith("2 "):
                            tle_count += 1
                            if len(valid_tles) < 3:
                                valid_tles.append((name, line1, line2))
                
                print(f"  ✓ Found {tle_count} Starlink satellites")
                
                if tle_count > 0:
                    print(f"\n  Sample TLEs:")
                    for name, line1, line2 in valid_tles:
                        print(f"    {name}")
                        print(f"    {line1[:70]}...")
                        print(f"    {line2[:70]}...")
                    
                    # Save to cache
                    cache_file = Path("tle_cache.txt")
                    cache_file.write_text(text)
                    print(f"\n  ✓ Saved {tle_count} satellites to {cache_file}")
                    print(f"  ✓ File size: {len(text)} bytes")
                    
                    return tle_count, url
                    
            except httpx.TimeoutException:
                print(f"  ❌ Timeout (connection timed out)")
            except httpx.ConnectError as e:
                print(f"  ❌ Connection error: {e}")
            except Exception as e:
                print(f"  ❌ Error: {type(e).__name__}: {e}")
    
    print("\n" + "=" * 60)
    print("❌ All CelesTrak endpoints failed")
    print("\nPossible reasons:")
    print("  - Network connectivity issue")
    print("  - CelesTrak server is down")
    print("  - Firewall/proxy blocking requests")
    print("  - Rate limiting (try again later)")
    
    return None, None

if __name__ == "__main__":
    result = asyncio.run(check_celestrak())
    if result[0]:
        print(f"\n✅ Successfully fetched {result[0]} satellites from {result[1]}")
    else:
        print("\n❌ Failed to fetch TLEs from CelesTrak")

