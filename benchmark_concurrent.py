import asyncio
import time
import os
from typing import Dict, Any

from fastapi.testclient import TestClient
import httpx

from backend.main import app

os.environ["OPENROUTER_API_KEY"] = "sk-test-fake-key"
# We mock out the actual httpx post or just let it fail with 502/503 depending on our mock key.
# Better yet, let's hit a fast local endpoint if we can, but since the task is about an external API call, we'll let it fail fast on the network, OR hit the real testserver via httpx.ASGITransport

async def run_requests(client, num_requests):
    tasks = []
    for _ in range(num_requests):
        # We'll use the concurrent httpx client targeting the test app
        tasks.append(client.post("/simulate", json={"prompt": "Doing a heavy deadlift"}))
    return await asyncio.gather(*tasks, return_exceptions=True)

async def main():
    # Use httpx.AsyncClient with ASGITransport to hit the FastAPI app directly
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # warm up
        await run_requests(client, 1)

        start_time = time.time()
        num_requests = 10
        responses = await run_requests(client, num_requests)
        end_time = time.time()

        print(f"Concurrent benchmark time for {num_requests} requests: {end_time - start_time:.4f} seconds")

        for idx, r in enumerate(responses):
            if isinstance(r, Exception):
                print(f"Request {idx} failed with {type(r).__name__}: {r}")
            else:
                print(f"Request {idx} status: {r.status_code}")

if __name__ == "__main__":
    asyncio.run(main())
