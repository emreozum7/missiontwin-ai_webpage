// The five report slots. When a new report is ready, put the PDF in the
// "reports/" folder and set its `file` path below. Slots with an empty
// `file` are shown as "Not yet available".
const REPORTS = [
  { title: "Project Proposal",         file: "reports/proposal.pdf" },
  { title: "Project Specifications",   file: "" },
  { title: "Project Analysis Report",  file: "" },
  { title: "High-Level Design Report", file: "" },
  { title: "Poster",                   file: "" },
];

const list = document.getElementById("report-list");

for (const report of REPORTS) {
  const card = document.createElement("article");
  card.className = "card report";

  const title = document.createElement("h3");
  title.textContent = report.title;

  const status = document.createElement("div");
  status.className = "status";

  card.append(title, status);

  if (report.file) {
    status.textContent = "Available";
    status.classList.add("ok");
    const actions = document.createElement("div");
    actions.className = "actions";
    const open = document.createElement("a");
    open.className = "btn";
    open.href = report.file;
    open.target = "_blank";
    open.rel = "noopener";
    open.textContent = "Open PDF";
    actions.append(open);
    card.append(actions);
  } else {
    status.textContent = "Not yet available";
  }

  list.append(card);
}
