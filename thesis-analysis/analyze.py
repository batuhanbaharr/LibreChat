"""
Statistics script for the Promptblocks user study.
Reads study_data.csv from the same folder, runs the data checks, the
descriptive stats, the paired hypothesis tests and the control checks,
then writes results.txt and five PNG charts.
"""

import pandas as pd
import numpy as np
from scipy import stats
import matplotlib.pyplot as plt
from datetime import date

DATA_FILE = "study_data.csv"
RESULTS_FILE = "results.txt"

ORANGE = "#E07B39"
BLUE = "#3C6E9F"

UEQ_ITEMS = ["ueq1", "ueq2", "ueq3", "ueq4", "ueq5", "ueq6", "ueq7", "ueq8"]
TLX_ITEMS = ["tlx_mental", "tlx_physical", "tlx_temporal",
             "tlx_performance", "tlx_effort", "tlx_frustration"]

# columns we compute and later run tests on
MEASURE_COLS = ["ueq_pragmatic", "ueq_hedonic", "ueq_overall"] + TLX_ITEMS + ["raw_tlx"]

output_lines = []


def say(text=""):
    print(text)
    output_lines.append(text)


def header(title):
    say("")
    say("=" * 60)
    say(title)
    say("=" * 60)


#  loading and cleaning 

def load_data():
    df = pd.read_csv(DATA_FILE)
    return df


def drop_missing(df):
    before = len(df)
    clean = df.dropna()
    dropped = before - len(clean)
    say(f"Rows dropped for missing values: {dropped}")
    return clean


def count_participants(df):
    n_participants = df["participant"].nunique()
    n_rows = len(df)
    say(f"Participants left: {n_participants}")
    say(f"Rows left: {n_rows}")
    return n_participants


def find_valid_participants(df):
    # a valid participant has exactly one promptblocks row and one llm row
    valid = []
    for pid, group in df.groupby("participant"):
        tools = list(group["tool"])
        one_pb = tools.count("promptblocks") == 1
        one_llm = tools.count("llm") == 1
        if one_pb and one_llm and len(group) == 2:
            valid.append(pid)
        else:
            say(f"Warning: participant {pid} does not have exactly one "
                f"promptblocks row and one llm row, leaving them out of the paired tests")
    return valid


def check_combination_balance(df):
    say("Participants per combination:")
    counts = df.groupby("combination")["participant"].nunique()
    for combo in sorted(counts.index):
        say(f"  combination {combo}: {counts[combo]} participants")


#  scale conversion 

def convert_ueq(df):
    df = df.copy()
    # the paper form uses 1 to 7, the official UEQ-S scale is -3 to +3
    for item in UEQ_ITEMS:
        df[item] = df[item] - 4
    df["ueq_pragmatic"] = df[["ueq1", "ueq2", "ueq3", "ueq4"]].mean(axis=1)
    df["ueq_hedonic"] = df[["ueq5", "ueq6", "ueq7", "ueq8"]].mean(axis=1)
    df["ueq_overall"] = df[UEQ_ITEMS].mean(axis=1)
    return df


def add_raw_tlx(df):
    df = df.copy()
    # performance already runs from perfect (1) to failed (9), so it stays as is
    df["raw_tlx"] = df[TLX_ITEMS].mean(axis=1)
    return df


#  part 1: descriptive table 

def print_descriptive_table(df):
    header("PART 1: DESCRIPTIVE RESULTS")
    pb = df[df["tool"] == "promptblocks"]
    llm = df[df["tool"] == "llm"]

    say("UEQ-S (scale -3 to +3)")
    say(f"{'':16}{'PromptBlocks':>24}{'LLM':>24}")
    say(f"{'':16}{'Mean':>12}{'SD':>12}{'Mean':>12}{'SD':>12}")
    ueq_rows = [("Pragmatic", "ueq_pragmatic"), ("Hedonic", "ueq_hedonic"), ("Overall", "ueq_overall")]
    for label, col in ueq_rows:
        say(f"{label:<16}{pb[col].mean():>12.2f}{pb[col].std():>12.2f}{llm[col].mean():>12.2f}{llm[col].std():>12.2f}")

    say("")
    say("NASA-TLX (scale 1 to 9)")
    say(f"{'':16}{'PromptBlocks':>24}{'LLM':>24}")
    say(f"{'':16}{'Mean':>12}{'SD':>12}{'Mean':>12}{'SD':>12}")
    tlx_rows = [("Mental", "tlx_mental"), ("Physical", "tlx_physical"), ("Temporal", "tlx_temporal"),
                ("Performance", "tlx_performance"), ("Effort", "tlx_effort"), ("Frustration", "tlx_frustration"),
                ("Raw TLX", "raw_tlx")]
    for label, col in tlx_rows:
        say(f"{label:<16}{pb[col].mean():>12.2f}{pb[col].std():>12.2f}{llm[col].mean():>12.2f}{llm[col].std():>12.2f}")


#  part 2: hypothesis tests 

def build_pairs(df, valid_participants):
    rows = []
    for pid in valid_participants:
        person = df[df["participant"] == pid]
        pb_row = person[person["tool"] == "promptblocks"].iloc[0]
        llm_row = person[person["tool"] == "llm"].iloc[0]
        row = {"participant": pid}
        for col in MEASURE_COLS:
            row[col + "_pb"] = pb_row[col]
            row[col + "_llm"] = llm_row[col]
        rows.append(row)
    return pd.DataFrame(rows)


def wilcoxon_z(diffs):
    # normal approximation for the Wilcoxon signed-rank test, zero
    # differences are dropped just like scipy does by default
    diffs = diffs[diffs != 0]
    n = len(diffs)
    ranks = stats.rankdata(np.abs(diffs))
    pos_rank_sum = ranks[diffs > 0].sum()
    mean_w = n * (n + 1) / 4
    std_w = np.sqrt(n * (n + 1) * (2 * n + 1) / 24)
    z = (pos_rank_sum - mean_w) / std_w
    return z, n


def run_test(label, pb_vals, llm_vals):
    pb_vals = np.array(pb_vals, dtype=float)
    llm_vals = np.array(llm_vals, dtype=float)
    diffs = pb_vals - llm_vals
    n = len(diffs)
    say("")
    say(f"{label} (n = {n})")

    if n < 3:
        say("  not enough pairs for a normality test, skipping")
        return

    stat_sw, p_sw = stats.shapiro(diffs)
    say(f"  Shapiro-Wilk on differences: W = {stat_sw:.3f}, p = {p_sw:.3f}")

    if p_sw > 0.05:
        stat, p = stats.ttest_rel(pb_vals, llm_vals)
        mean_diff = diffs.mean()
        sd_diff = diffs.std(ddof=1)
        d = mean_diff / sd_diff
        say("  Test used: paired t-test")
        say(f"  t = {stat:.3f}, p = {p:.3f}")
        say(f"  Cohen's d = {d:.3f}")
    else:
        stat, p = stats.wilcoxon(pb_vals, llm_vals)
        z, n_used = wilcoxon_z(diffs)
        r = z / np.sqrt(n_used)
        say("  Test used: Wilcoxon signed-rank test")
        say(f"  W = {stat:.3f}, p = {p:.3f}")
        say(f"  effect size r = {r:.3f} (N used = {n_used})")


def run_hypothesis_tests(pairs_df):
    header("PART 2: HYPOTHESIS TESTS")
    n_pairs = len(pairs_df)
    say(f"Number of pairs used: {n_pairs}")

    primary_measures = [("UEQ Overall", "ueq_overall"), ("Raw TLX", "raw_tlx")]
    exploratory_measures = [
        ("UEQ Pragmatic", "ueq_pragmatic"), ("UEQ Hedonic", "ueq_hedonic"),
        ("TLX Mental", "tlx_mental"), ("TLX Physical", "tlx_physical"),
        ("TLX Temporal", "tlx_temporal"), ("TLX Performance", "tlx_performance"),
        ("TLX Effort", "tlx_effort"), ("TLX Frustration", "tlx_frustration"),
    ]

    say("")
    say("Primary measures")
    for label, col in primary_measures:
        run_test(label, pairs_df[col + "_pb"], pairs_df[col + "_llm"])

    say("")
    say("Exploratory measures")
    for label, col in exploratory_measures:
        run_test(label, pairs_df[col + "_pb"], pairs_df[col + "_llm"])

    say("")
    if n_pairs < 15:
        say(f"Note: with only {n_pairs} pairs the tests have low power at this "
            f"sample size, effect sizes matter more than p-values here.")
    say("Note: the exploratory measures above are not corrected for multiple "
        "comparisons and should be read as descriptive only.")

    return n_pairs


#  part 3: control checks 

def control_checks(df):
    header("PART 3: CONTROL CHECKS")

    say("By session")
    for session in sorted(df["session"].unique()):
        subset = df[df["session"] == session]
        say(f"  session {session}: Raw TLX mean = {subset['raw_tlx'].mean():.2f}, "
            f"UEQ Overall mean = {subset['ueq_overall'].mean():.2f}, rows = {len(subset)}")

    say("")
    say("By task")
    for task in sorted(df["task"].unique()):
        subset = df[df["task"] == task]
        say(f"  task {task}: Raw TLX mean = {subset['raw_tlx'].mean():.2f}, "
            f"UEQ Overall mean = {subset['ueq_overall'].mean():.2f}, rows = {len(subset)}")


#  part 4: save results 

def save_results(n_participants):
    top_lines = [
        f"Results generated on: {date.today().isoformat()}",
        f"Number of participants: {n_participants}",
        "",
    ]
    with open(RESULTS_FILE, "w") as f:
        for line in top_lines:
            f.write(line + "\n")
        for line in output_lines:
            f.write(line + "\n")
    print(f"\nSaved results to {RESULTS_FILE}")


#  part 5: charts 

def style_axes(ax, title, ylabel):
    ax.set_facecolor("white")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis="y", color="lightgrey", alpha=0.25)
    ax.set_axisbelow(True)
    ax.set_title(title, fontsize=13, loc="left", fontweight="normal")
    ax.set_ylabel(ylabel, fontsize=11)
    ax.tick_params(axis="both", labelsize=11)


def add_bar_labels(ax, bars):
    for bar in bars:
        height = bar.get_height()
        va = "bottom" if height >= 0 else "top"
        offset = 0.05 if height >= 0 else -0.05
        ax.text(bar.get_x() + bar.get_width() / 2, height + offset,
                 f"{height:.1f}", ha="center", va=va, fontsize=9, color="dimgray")


def save_chart(fig, filename):
    fig.tight_layout()
    fig.savefig(filename, dpi=300)
    plt.close(fig)


def make_ueq_chart(df):
    labels = ["Pragmatische Qualität", "Hedonische Qualität", "Gesamt"]
    cols = ["ueq_pragmatic", "ueq_hedonic", "ueq_overall"]
    pb = df[df["tool"] == "promptblocks"]
    llm = df[df["tool"] == "llm"]

    pb_means = [pb[c].mean() for c in cols]
    pb_stds = [pb[c].std() for c in cols]
    llm_means = [llm[c].mean() for c in cols]
    llm_stds = [llm[c].std() for c in cols]

    x = np.arange(len(labels))
    width = 0.35

    fig, ax = plt.subplots(figsize=(8, 5))
    bars1 = ax.bar(x - width / 2 - 0.02, pb_means, width, yerr=pb_stds, capsize=3,
                    color=ORANGE, label="PromptBlocks", ecolor="black")
    bars2 = ax.bar(x + width / 2 + 0.02, llm_means, width, yerr=llm_stds, capsize=3,
                    color=BLUE, label="Bevorzugtes LLM", ecolor="black")

    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_ylim(-3, 3)
    ax.axhline(0, color="grey", linewidth=0.8)
    ax.text(0.01, 0.51, "neutral", transform=ax.transAxes, ha="left", va="bottom",
            fontsize=9, color="grey")

    style_axes(ax, "UEQ-S: Vergleich der beiden Werkzeuge", "Bewertung (-3 bis +3)")
    add_bar_labels(ax, bars1)
    add_bar_labels(ax, bars2)
    ax.legend(frameon=False, loc="best")

    save_chart(fig, "ueq_comparison.png")


def make_tlx_chart(df):
    labels = ["Geistige Anforderung", "Körperliche Anforderung", "Zeitliche Anforderung",
              "Leistung", "Anstrengung", "Frustration"]
    cols = TLX_ITEMS
    pb = df[df["tool"] == "promptblocks"]
    llm = df[df["tool"] == "llm"]

    pb_means = [pb[c].mean() for c in cols]
    pb_stds = [pb[c].std() for c in cols]
    llm_means = [llm[c].mean() for c in cols]
    llm_stds = [llm[c].std() for c in cols]

    x = np.arange(len(labels))
    width = 0.35

    fig, ax = plt.subplots(figsize=(8, 5))
    bars1 = ax.bar(x - width / 2 - 0.02, pb_means, width, yerr=pb_stds, capsize=3,
                    color=ORANGE, label="PromptBlocks", ecolor="black")
    bars2 = ax.bar(x + width / 2 + 0.02, llm_means, width, yerr=llm_stds, capsize=3,
                    color=BLUE, label="Bevorzugtes LLM", ecolor="black")

    ax.set_xticks(x)
    ax.set_xticklabels(labels, rotation=15, ha="right")
    ax.set_ylim(1, 9)

    style_axes(ax, "NASA-TLX: Vergleich der sechs Dimensionen", "Bewertung (1 bis 9)")
    add_bar_labels(ax, bars1)
    add_bar_labels(ax, bars2)
    ax.legend(frameon=False, loc="best")

    note = "Bei allen Dimensionen bedeutet ein höherer Wert eine höhere Belastung."
    fig.text(0.5, 0.01, note, ha="center", fontsize=8, color="grey")

    fig.tight_layout(rect=[0, 0.06, 1, 1])
    fig.savefig("tlx_dimensions.png", dpi=300)
    plt.close(fig)


def make_raw_tlx_chart(df):
    pb = df[df["tool"] == "promptblocks"]
    llm = df[df["tool"] == "llm"]

    means = [pb["raw_tlx"].mean(), llm["raw_tlx"].mean()]
    stds = [pb["raw_tlx"].std(), llm["raw_tlx"].std()]
    colors = [ORANGE, BLUE]
    labels = ["PromptBlocks", "Bevorzugtes LLM"]

    x = np.array([0, 1])
    width = 0.5

    fig, ax = plt.subplots(figsize=(8, 5))
    bars = ax.bar(x, means, width, yerr=stds, capsize=3, color=colors, ecolor="black")

    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_xlim(-0.8, 1.8)
    ax.set_ylim(1, 9)

    style_axes(ax, "Raw TLX: Gesamte Arbeitsbelastung", "Raw TLX (1 bis 9)")
    add_bar_labels(ax, bars)

    save_chart(fig, "raw_tlx.png")


def make_person_chart(pairs_df, col, ylim, title, ylabel, filename, zero_line):
    fig, ax = plt.subplots(figsize=(8, 5))

    x_llm, x_pb = 0, 1
    n = len(pairs_df)
    offsets = np.linspace(-0.02, 0.02, n) if n > 1 else [0]

    llm_vals = pairs_df[col + "_llm"].values
    pb_vals = pairs_df[col + "_pb"].values

    for i in range(n):
        offset = offsets[i]
        ax.plot([x_llm + offset, x_pb + offset], [llm_vals[i], pb_vals[i]],
                color="grey", alpha=0.5, linewidth=1, marker="o", markersize=3)

    mean_llm = llm_vals.mean()
    mean_pb = pb_vals.mean()
    ax.plot([x_llm, x_pb], [mean_llm, mean_pb], color=ORANGE, linewidth=2.5,
            marker="o", markersize=8, label="Mittelwert")

    if zero_line:
        ax.axhline(0, color="grey", linewidth=0.8)
        ax.text(0.01, 0.51, "neutral", transform=ax.transAxes, ha="left", va="bottom",
                fontsize=9, color="grey")

    ax.set_xticks([x_llm, x_pb])
    ax.set_xticklabels(["Bevorzugtes LLM", "PromptBlocks"])
    ax.set_xlim(-0.3, 1.3)
    ax.set_ylim(ylim)

    style_axes(ax, title, ylabel)
    ax.legend(frameon=False, loc="best")

    save_chart(fig, filename)


def make_charts(df, pairs_df):
    make_ueq_chart(df)
    make_tlx_chart(df)
    make_raw_tlx_chart(df)
    make_person_chart(pairs_df, "raw_tlx", (1, 9),
                       "Raw TLX: Veränderung pro Teilnehmer", "Raw TLX (1 bis 9)",
                       "raw_tlx_per_person.png", zero_line=False)
    make_person_chart(pairs_df, "ueq_overall", (-3, 3),
                       "UEQ-S Gesamt: Veränderung pro Teilnehmer", "Bewertung (-3 bis +3)",
                       "ueq_per_person.png", zero_line=True)


#  main 

def main():
    df = load_data()

    header("DATA CHECKS")
    df = drop_missing(df)
    n_participants = count_participants(df)
    valid_participants = find_valid_participants(df)
    check_combination_balance(df)

    df = convert_ueq(df)
    df = add_raw_tlx(df)

    print_descriptive_table(df)

    pairs_df = build_pairs(df, valid_participants)
    run_hypothesis_tests(pairs_df)

    control_checks(df)

    save_results(n_participants)

    print("Creating charts...")
    make_charts(df, pairs_df)
    print("Done.")


if __name__ == "__main__":
    main()
