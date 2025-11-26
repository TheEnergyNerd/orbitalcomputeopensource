/**
 * Script to fetch NASA 3D models for satellites and orbital hubs
 * Run with: npx ts-node scripts/fetch_nasa_models.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";

const MODELS_DIR = path.join(__dirname, "../frontend/public/models");

// NASA 3D Resources URLs (example - you'll need to find actual model URLs)
const MODELS = [
  {
    name: "sat_body.glb",
    url: "https://nasa3d.arc.nasa.gov/models/sat_body.glb", // Placeholder URL
    description: "Satellite body model",
  },
  {
    name: "tdrs.glb",
    url: "https://nasa3d.arc.nasa.gov/models/tdrs.glb", // Placeholder URL
    description: "TDRS orbital hub model",
  },
];

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirect
          return downloadFile(response.headers.location!, dest).then(resolve).catch(reject);
        }
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

async function main() {
  // Create models directory if it doesn't exist
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }

  console.log("Fetching NASA 3D models...");
  console.log("Note: You may need to update the URLs in this script with actual NASA 3D Resources URLs");

  for (const model of MODELS) {
    const dest = path.join(MODELS_DIR, model.name);
    console.log(`Downloading ${model.name}...`);
    try {
      await downloadFile(model.url, dest);
      console.log(`✓ Downloaded ${model.name}`);
    } catch (error) {
      console.error(`✗ Failed to download ${model.name}:`, error);
      console.log(`  You can manually download from NASA 3D Resources and place it at: ${dest}`);
    }
  }

  console.log("\nDone! Models are in:", MODELS_DIR);
  console.log(
    "\nTo find actual NASA 3D model URLs, visit: https://nasa3d.arc.nasa.gov/models"
  );
}

main().catch(console.error);

