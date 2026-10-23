// Add a report file in "reports/" and set its path here when it is ready.
// Empty paths stay visible in the library as "Not yet available".
const REPORTS = [
  { title: "Project Proposal", file: "reports/CMPE491Proposal.docx" },
  { title: "Project Specifications", file: "" },
  { title: "Project Analysis Report", file: "" },
  { title: "High-Level Design Report", file: "" },
  { title: "Poster", file: "" },
];

const reportList = document.getElementById("report-list");

for (const [index, report] of REPORTS.entries()) {
  const card = document.createElement("article");
  card.className = "report-card reveal";
  if (report.file) card.classList.add("is-available");

  const top = document.createElement("div");
  top.className = "report-card-top";

  const number = document.createElement("span");
  number.textContent = String(index + 1).padStart(2, "0");

  const fileMark = document.createElement("span");
  fileMark.className = "report-file-mark";
  fileMark.textContent = report.file ? report.file.split(".").pop().toUpperCase() : "—";
  fileMark.setAttribute("aria-hidden", "true");
  top.append(number, fileMark);

  const title = document.createElement("h3");
  title.textContent = report.title;

  const status = document.createElement("div");
  status.className = "report-status";
  status.textContent = report.file ? "Available" : "Not yet available";

  card.append(top, title, status);

  if (report.file) {
    const actions = document.createElement("div");
    actions.className = "report-actions";

    const open = document.createElement("a");
    open.className = "report-open";
    open.href = report.file;
    open.target = "_blank";
    open.rel = "noopener";
    open.setAttribute("aria-label", `Open ${report.title}`);
    open.append(document.createTextNode("Open document"));

    const arrow = document.createElement("span");
    arrow.textContent = "↗";
    arrow.setAttribute("aria-hidden", "true");
    open.append(arrow);
    actions.append(open);
    card.append(actions);
  }

  reportList.append(card);
}

document.documentElement.classList.add("js-enabled");

const revealItems = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries, currentObserver) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        currentObserver.unobserve(entry.target);
      }
    }
  }, { threshold: 0.08, rootMargin: "0px 0px -12% 0px" });

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const progressFill = document.getElementById("reading-progress-fill");
let progressFrame = 0;

function updateReadingProgress() {
  if (progressFrame) return;

  progressFrame = window.requestAnimationFrame(() => {
    const scrollableHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    const progress = Math.min(window.scrollY / scrollableHeight, 1);
    progressFill.style.transform = `scaleX(${progress})`;
    progressFrame = 0;
  });
}

window.addEventListener("scroll", updateReadingProgress, { passive: true });
window.addEventListener("resize", updateReadingProgress);
updateReadingProgress();
