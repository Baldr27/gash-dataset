import os
import json

DATA_DIR = "docs/data"
OUTPUT_FILE = os.path.join(DATA_DIR, "workflow_index.json")

workflow_index = {}

for owner in os.listdir(DATA_DIR):
    owner_path = os.path.join(DATA_DIR, owner)
    if not os.path.isdir(owner_path):
        continue
    workflow_index[owner] = {}

    for repo in os.listdir(owner_path):
        repo_path = os.path.join(owner_path, repo)
        if not os.path.isdir(repo_path):
            continue

        # List all .json files in the repo directory
        json_files = [f for f in os.listdir(repo_path) if f.endswith(".json")]
        if json_files:
            workflow_index[owner][repo] = json_files

# Save to JSON
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(workflow_index, f, indent=2)

print(f"Workflow index saved to {OUTPUT_FILE}")

