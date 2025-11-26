"""
Starlink TLE Service
Handles fetching, caching, and serving Starlink TLE data
"""
import asyncio
import json
import time
from pathlib import Path
from typing import List, Dict, Optional
import httpx
from skyfield.api import load, EarthSatellite

ts = load.timescale()

class StarlinkService:
    """Service for managing Starlink TLE data with caching"""
    
    def __init__(self, cache_dir: Path = Path(".")):
        self.cache_dir = cache_dir
        self.cache_file = cache_dir / "tle_cache.txt"
        self.cache_time_file = cache_dir / "tle_cache_time.txt"
        self.cache_max_age = 2 * 60 * 60  # 2 hours
        self.satellites: List[EarthSatellite] = []
        self.tle_data: List[Dict[str, str]] = []
        self._lock = asyncio.Lock()
    
    async def fetch_and_cache_tles(self) -> List[EarthSatellite]:
        """Fetch TLEs from CelesTrak with caching"""
        async with self._lock:
            # Check cache first
            if self.cache_file.exists() and self.cache_time_file.exists():
                try:
                    cache_time = float(self.cache_time_file.read_text().strip())
                    age = time.time() - cache_time
                    if age < self.cache_max_age:
                        print(f"[StarlinkService] Using cached TLEs (age: {age/3600:.1f} hours)")
                        return self._load_from_cache()
                except Exception as e:
                    print(f"[StarlinkService] Error reading cache: {e}")
            
            # Fetch from CelesTrak
            urls = [
                "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle",
                "https://celestrak.org/NORAD/elements/starlink.txt",
            ]
            
            async with httpx.AsyncClient() as client:
                for url in urls:
                    try:
                        print(f"[StarlinkService] Fetching from: {url}")
                        headers = {
                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                            "Accept": "text/plain",
                            "Referer": "https://celestrak.org/",
                        }
                        response = await client.get(url, timeout=30.0, headers=headers, follow_redirects=True)
                        
                        if response.status_code == 200 and not response.text.strip().startswith("<!DOCTYPE"):
                            sats = self._parse_tles(response.text)
                            if len(sats) > 0:
                                self._save_to_cache(response.text)
                                self.satellites = sats
                                print(f"[StarlinkService] Loaded {len(sats)} satellites from {url}")
                                return sats
                    except Exception as e:
                        print(f"[StarlinkService] Error fetching from {url}: {e}")
                        continue
            
            # Fallback to cache even if expired
            if self.cache_file.exists():
                print("[StarlinkService] Using expired cache as fallback")
                return self._load_from_cache()
            
            # Last resort: create dummy satellites
            print("[StarlinkService] Creating dummy satellites")
            return self._create_dummy_satellites()
    
    def _parse_tles(self, text: str) -> List[EarthSatellite]:
        """Parse TLE text into EarthSatellite objects"""
        lines = text.strip().split("\n")
        sats = []
        tle_data = []
        
        for i in range(0, len(lines) - 1, 3):
            if i + 2 < len(lines):
                name = lines[i].strip()
                line1 = lines[i + 1].strip()
                line2 = lines[i + 2].strip()
                if line1.startswith("1 ") and line2.startswith("2 "):
                    try:
                        sat = EarthSatellite(line1, line2, name, ts)
                        sats.append(sat)
                        tle_data.append({
                            "id": f"sat_{len(sats)}",
                            "name": name,
                            "tleLine1": line1,
                            "tleLine2": line2,
                        })
                    except Exception as e:
                        print(f"[StarlinkService] Error parsing satellite {name}: {e}")
                        continue
        
        self.tle_data = tle_data
        return sats
    
    def _load_from_cache(self) -> List[EarthSatellite]:
        """Load satellites from cache file"""
        try:
            text = self.cache_file.read_text()
            sats = self._parse_tles(text)
            self.satellites = sats
            return sats
        except Exception as e:
            print(f"[StarlinkService] Error loading from cache: {e}")
            return []
    
    def _save_to_cache(self, text: str):
        """Save TLE text to cache"""
        try:
            self.cache_file.write_text(text)
            self.cache_time_file.write_text(str(time.time()))
        except Exception as e:
            print(f"[StarlinkService] Error saving cache: {e}")
    
    def _create_dummy_satellites(self) -> List[EarthSatellite]:
        """Create dummy satellites for testing"""
        sats = []
        for i in range(100):
            try:
                name = f"STARLINK-{i+1000}"
                norad_id = 50000 + i
                epoch_day = 325.0
                mean_motion = 15.0
                inclination = 53.0
                raan = i * 3.6
                
                line1 = f"1 {norad_id:05d}U 23001A   {epoch_day:012.8f}  .00000000  00000+0  00000+0 0  9999"
                line2 = f"2 {norad_id:05d} {inclination:8.4f} {raan:08.4f} 0000000   0.0000 270.0000 {mean_motion:11.8f}"
                sat = EarthSatellite(line1, line2, name, ts)
                sats.append(sat)
            except Exception:
                continue
        return sats
    
    def get_tle_list(self) -> List[Dict[str, str]]:
        """Get TLE data as list of dicts"""
        return self.tle_data
    
    def get_satellites(self) -> List[EarthSatellite]:
        """Get current satellite list"""
        return self.satellites

# Global instance
_starlink_service: Optional[StarlinkService] = None

def get_starlink_service() -> StarlinkService:
    """Get or create global StarlinkService instance"""
    global _starlink_service
    if _starlink_service is None:
        _starlink_service = StarlinkService()
    return _starlink_service

