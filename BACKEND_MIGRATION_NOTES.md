# Backend Migration Notes

## Real-World Satellite Dependencies Removal

The frontend simulation engine has been fully parameterized and no longer depends on real-world satellite data. However, the backend (`backend/main.py` and `backend/services/starlink.py`) still contains Celestrak/TLE fetching code.

### Required Backend Changes

1. **Remove Celestrak/TLE Dependencies:**
   - Delete or disable `fetch_tles()` function in `backend/main.py`
   - Remove `StarlinkService` class from `backend/services/starlink.py`
   - Remove TLE parsing and EarthSatellite propagation code

2. **Replace with Parameterized Shells:**
   - Use the new `shellModel.ts` from frontend as reference
   - Create equivalent Python models for orbital shells
   - Generate satellite positions from shell parameters instead of TLE data

3. **Update API Endpoints:**
   - Modify `/api/state` endpoint to return shell-based data instead of TLE-based satellites
   - Update satellite position calculations to use shell parameters

### Frontend is Ready

The frontend simulation engine is now fully abstracted:
- ✅ Parameterized orbital shells (`shellModel.ts`)
- ✅ No real-world operator references
- ✅ Future-friendly routing and latency models
- ✅ Physics-based calculations only

The backend can continue to serve shell-based satellite data without needing real TLE feeds.

