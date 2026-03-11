import { extractMeetingData, cleanTranscript } from "../services/ai.service";

async function main() {
  const transcript = `Amit (Project Manager):
Hi everyone, today we are starting the project for TechNova Solutions.

Sarah (Client):
Hi, I’m Sarah Johnson, the primary contact from TechNova. You can contact me at sarah.johnson@technova.com
.

Amit:
The project summary is to build a modern company website for TechNova where users can learn about services and contact the company.

Sarah:
Yes, our main goal is to improve online presence and generate more leads.

Amit:
The key deliverables will be:

Responsive company website

Contact form

Admin panel

Sarah:
That works for us.

Amit:
The timeline for the project is 4 weeks.

Amit:
The milestones are:
Week 1 – Design approval
Week 2 – Frontend development
Week 3 – Backend integration
Week 4 – Testing and launch

Sarah:
The budget we agreed on is $5000.

Amit:
For the technical requirements, we will use React, Node.js, and MongoDB.

Amit:
One risk could be delays if content or images are provided late.

Amit:
Currently payment gateway details are missing, which we will need later.`;

  const cleaned = cleanTranscript(transcript);
  const result = await extractMeetingData(cleaned);
  console.log("====== TEST EXTRACTION RESULT ======");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

