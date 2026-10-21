"""Generate a small SYNTHETIC dataset (random numbers, no real participants)
with the column layout analyze.py expects."""
import csv
import random

random.seed(42)

# combination -> [(session, task, tool), (session, task, tool)]
COMBINATIONS = {
    1: [(1, "A", "llm"), (2, "B", "promptblocks")],
    2: [(1, "A", "promptblocks"), (2, "B", "llm")],
    3: [(1, "B", "llm"), (2, "A", "promptblocks")],
    4: [(1, "B", "promptblocks"), (2, "A", "llm")],
}
UEQ = [f"ueq{i}" for i in range(1, 9)]
TLX = ["tlx_mental", "tlx_physical", "tlx_temporal",
       "tlx_performance", "tlx_effort", "tlx_frustration"]


def clip(value, low, high):
    return max(low, min(high, round(value)))


rows = []
pid = 0
for combo, sessions in COMBINATIONS.items():
    for _ in range(4):
        pid += 1
        for session, task, tool in sessions:
            pb = tool == "promptblocks"
            row = {"participant": f"P{pid:02d}", "combination": combo,
                   "session": session, "task": task, "tool": tool}
            for item in UEQ:
                row[item] = clip(random.gauss(4.6 if pb else 4.5, 1.2), 1, 7)
            for item in TLX:
                row[item] = clip(random.gauss(3.6 if pb else 2.7, 1.3), 1, 9)
            rows.append(row)

with open("example_data/study_data_synthetic.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
print(len(rows), "rows written")
