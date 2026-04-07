import timeit

def run_benchmark():
    # Call it 100,000 times
    setup = "from backend.neuromodulation import build_vfx_profile"
    stmt = "build_vfx_profile('adrenaline', 0.8)"

    times = timeit.repeat(stmt, setup=setup, repeat=5, number=100000)
    best_time = min(times)

    print(f"Best time for 100,000 calls: {best_time:.4f} seconds")

if __name__ == "__main__":
    run_benchmark()
