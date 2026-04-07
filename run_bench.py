import asyncio
import time
import os
import httpx
import uvicorn
import multiprocessing

from backend.main import app

def run_server():
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8001, log_level="warning")

async def run_requests(client, num_requests):
    tasks = []
    for _ in range(num_requests):
        tasks.append(client.post("http://127.0.0.1:8001/simulate", json={"prompt": "Doing a heavy deadlift"}))
    return await asyncio.gather(*tasks, return_exceptions=True)

async def main():
    os.environ["OPENROUTER_API_KEY"] = "sk-test-fake-key"

    server_process = multiprocessing.Process(target=run_server)
    server_process.start()

    # Wait for server to be ready
    time.sleep(2)

    async with httpx.AsyncClient() as client:
        # warm up
        await run_requests(client, 1)

        start_time = time.time()
        num_requests = 100
        responses = await run_requests(client, num_requests)
        end_time = time.time()

        print(f"Concurrent benchmark time for {num_requests} requests: {end_time - start_time:.4f} seconds")

        for idx, r in enumerate(responses):
            if isinstance(r, Exception):
                print(f"Request {idx} failed with {type(r).__name__}: {r}")
            # else:
            #     print(f"Request {idx} status: {r.status_code}")

    server_process.terminate()
    server_process.join()

if __name__ == "__main__":
    asyncio.run(main())
