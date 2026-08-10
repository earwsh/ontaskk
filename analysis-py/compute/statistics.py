import math
import statistics as stat


def _round(value: float, digits: int = 1) -> float:
    return round(value, digits)


def _stddev(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    return stat.pstdev(values)


def _percentile(sorted_values: list[float], p: float) -> float:
    n = len(sorted_values)
    if n == 0:
        return 0.0
    if n == 1:
        return sorted_values[0]
    rank = (p / 100.0) * (n - 1)
    lo = math.floor(rank)
    hi = math.ceil(rank)
    if lo == hi:
        return sorted_values[lo]
    frac = rank - lo
    return sorted_values[lo] * (1 - frac) + sorted_values[hi] * frac


def _distribution_bins(values: list[float], bin_count: int = 10) -> list[dict]:
    if not values:
        return []
    lo, hi = min(values), max(values)
    if hi == lo:
        return [{"range": f"{lo:g}", "count": len(values)}]
    step = (hi - lo) / bin_count
    counts = [0] * bin_count
    for v in values:
        idx = int((v - lo) / step)
        if idx >= bin_count:
            idx = bin_count - 1
        counts[idx] += 1
    return [
        {"range": f"{lo + i * step:g} - {lo + (i + 1) * step:g}", "count": counts[i]}
        for i in range(bin_count)
        if counts[i] > 0
    ]


def _describe(name: str, values: list[float]) -> dict:
    if not values:
        return {
            "name": name, "count": 0, "min": 0, "max": 0, "mean": 0,
            "median": 0, "stddev": 0, "q1": 0, "q3": 0, "p90": 0,
        }
    sorted_values = sorted(values)
    return {
        "name": name,
        "count": len(values),
        "min": _round(sorted_values[0]),
        "max": _round(sorted_values[-1]),
        "mean": _round(stat.fmean(values)),
        "median": _round(stat.median(values)),
        "stddev": _round(_stddev(values)),
        "q1": _round(_percentile(sorted_values, 25)),
        "q3": _round(_percentile(sorted_values, 75)),
        "p90": _round(_percentile(sorted_values, 90)),
    }


def analyze_stats(payload: dict) -> dict:
    series = payload.get("series") or []
    described = []
    distributions = {}

    for item in series:
        name = item.get("name") or "series"
        values = [float(v) for v in (item.get("values") or []) if v is not None]
        described.append(_describe(name, values))
        dist = _distribution_bins(values, int(item.get("bins", 10)))
        if dist:
            distributions[name] = dist

    return {
        "series": described,
        "distributions": distributions,
        "computedBy": "python",
    }
