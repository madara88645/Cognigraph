import time

from backend.main import run_snn
from backend.neuromodulation import ResolvedSnnParams


def benchmark():
    resolved = ResolvedSnnParams(
        v_thresh=-50.0,
        tau_ms=20.0,
        refractory_ms=2.0,
        epsp=0.5,
        v_center=-60.0,
        v_spread=10.0,
        active_rate_hz=50.0,
        background_rate_hz=10.0,
        lobe_rates_hz=[
            ("frontal", 50.0),
            ("parietal", 20.0),
            ("occipital", 10.0),
            ("temporal", 15.0),
            ("cerebellum", 25.0),
        ],
    )

    # Warmup
    for _ in range(2):
        run_snn(active_lobe="frontal", resolved=resolved, duration_ms=10, neurons_per_lobe=10)

    start_time = time.perf_counter()
    iterations = 50
    for _ in range(iterations):
        run_snn(active_lobe="frontal", resolved=resolved, duration_ms=50, neurons_per_lobe=50)
    end_time = time.perf_counter()

    avg_time = (end_time - start_time) / iterations
    print(f"Average time per run_snn: {avg_time * 1000:.2f} ms")
    return avg_time


if __name__ == "__main__":
    benchmark()
