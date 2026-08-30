<script setup lang="ts">
useSeoMeta({
  title: 'Resume | Leonardo Prasetyo',
  description: 'Leonardo Prasetyo - software engineer specialising in full-stack development, applied AI and cloud.'
})
</script>

<template>
  <UDashboardPanel
    id="resume"
    class="min-h-0"
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <template #header>
      <Navbar>
        <template #title>
          <span class="font-mono text-xs font-medium tracking-wider text-muted">~/resume</span>
        </template>

        <UButton
          to="/leonardo-prasetyo-resume.pdf"
          target="_blank"
          label="View PDF"
          icon="i-lucide-file-down"
          color="neutral"
          variant="ghost"
          size="sm"
        />
      </Navbar>
    </template>

    <template #body>
      <div class="min-h-full overflow-y-auto px-4 pb-8 pt-20 sm:px-6 sm:pb-12 lg:px-10 lg:pt-24">
        <article class="mx-auto max-w-6xl">
          <header class="relative overflow-hidden border-b border-default px-6 py-9 sm:px-10 sm:py-12 lg:px-14">
            <div class="absolute -right-20 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
            <div class="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <p class="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                  Software Engineer / Melbourne, AU
                </p>
                <h1 class="text-4xl font-bold tracking-tight text-highlighted sm:text-5xl lg:text-6xl">
                  Leonardo Prasetyo
                </h1>
                <p class="mt-4 max-w-3xl text-lg leading-relaxed text-toned sm:text-xl">
                  Full-stack engineer building reliable web products, cloud services and applied AI systems.
                </p>
              </div>

              <div class="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
                <UBadge
                  label="FULL STACK"
                  color="primary"
                  variant="soft"
                  class="font-mono"
                />
                <UBadge
                  label="APPLIED AI"
                  color="primary"
                  variant="soft"
                  class="font-mono"
                />
                <UBadge
                  label="CLOUD"
                  color="primary"
                  variant="soft"
                  class="font-mono"
                />
              </div>
            </div>

            <div class="relative mt-8 flex flex-wrap gap-x-5 gap-y-3 font-mono text-xs text-muted sm:text-sm">
              <a href="mailto:leonardo.prasetyo5@gmail.com" class="transition-colors hover:text-primary">
                leonardo.prasetyo5@gmail.com
              </a>
              <a href="tel:+61401019093" class="transition-colors hover:text-primary">
                0401 019 093
              </a>
              <a href="https://linkedin.com/in/lpra25" target="_blank" class="transition-colors hover:text-primary">
                linkedin.com/in/lpra25
              </a>
              <a href="https://github.com/Beanmommo" target="_blank" class="transition-colors hover:text-primary">
                github.com/Beanmommo
              </a>
            </div>
          </header>

          <div class="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
            <main class="px-6 py-9 sm:px-10 sm:py-12 lg:px-14">
              <section>
                <ResumeSectionHeading index="01" title="Profile" />
                <p class="mt-5 max-w-3xl leading-7 text-toned">
                  Software engineer delivering web applications, cloud services and automation for Australian energy
                  and technology consulting businesses. Experience spans Nuxt/Vue frontends, NestJS/PostgreSQL
                  services and AWS deployment, with additional work in applied AI and Azure automation. Translates
                  stakeholder requirements into usable software, from discovery and implementation through testing
                  and deployment.
                </p>
              </section>

              <section class="mt-12">
                <ResumeSectionHeading index="02" title="Experience" />

                <div class="mt-7 space-y-12">
                  <ResumeExperience
                    company="Outpost Ventures"
                    location="Melbourne, VIC"
                    period="Jun 2025 - Present"
                    description="Energy consulting for major Australian distribution and transmission businesses, developers and retailers."
                  >
                    <ResumeRole title="Software Engineer" period="Sep 2025 - Present">
                      <ResumeProject title="Reglink">
                        <ul>
                          <li>Built a role-based energy regulatory platform with Nuxt/Vue and NestJS/PostgreSQL, including dashboard, search, file management, AI chat, user management and SaaS experiences.</li>
                          <li>Deployed with AWS Amplify, S3 and Cognito, and extended Python/Scrapy collection workflows with daily EventBridge, Lambda and EC2 jobs.</li>
                        </ul>
                      </ResumeProject>

                      <ResumeProject title="OPA">
                        <ul>
                          <li>Developed the frontend of a SCADA application for monitoring, commissioning and managing site generation assets with logic-based automation.</li>
                          <li>Worked across a pnpm monorepo of frontend, backend and Raspberry Pi packages using AWS CDK, AWS IoT Core, MQTT and Lambda.</li>
                        </ul>
                      </ResumeProject>

                      <ResumeProject title="Verify">
                        <ul>
                          <li>Delivered the frontend for an energy determinations AI chat platform in three weeks, including SaaS, authentication and regulatory-library search experiences.</li>
                        </ul>
                      </ResumeProject>

                      <ResumeProject title="Doc Forge / Arcane Scout">
                        <ul>
                          <li>Advised on vector database, RAG, chunking, embeddings and LangChain tool architecture; extended collection workflows to add 50,000 AER source files.</li>
                        </ul>
                      </ResumeProject>

                      <ResumeProject title="Konnect">
                        <ul>
                          <li>Delivered full-stack development for a connection application platform with AI site assessment, energy infrastructure maps, spreadsheet-style editing, uploads and cross-sheet references.</li>
                          <li>Applied Azure AI Foundry model APIs, agentic AI and structured outputs, configuring personas, prompts and retrieval workflows.</li>
                        </ul>
                      </ResumeProject>
                    </ResumeRole>

                    <ResumeRole title="Software Engineer Intern" period="Jun 2025 - Sep 2025">
                      <ul>
                        <li>Prototyped an all-in-one regulatory energy platform, then refactored and maintained the AI-generated codebase.</li>
                        <li>Built a TypeScript and Playwright data-scraping algorithm and configured Firebase Authentication and Realtime Database.</li>
                      </ul>
                    </ResumeRole>
                  </ResumeExperience>

                  <ResumeExperience
                    company="QikSolve"
                    location="Melbourne, VIC"
                    period="May 2024 - Jun 2026"
                    description="Australian technology consultancy and software provider serving GMP clients."
                  >
                    <ResumeRole title="Freelance Software Developer">
                      <ResumeProject title="Luminai-review">
                        <ul>
                          <li>Developed Azure DevOps pipelines for a serverless, email-triggered AI document validation workflow using YAML, Bicep and Python.</li>
                          <li>Built Power Automate, Logic Apps and SharePoint workflows, transforming documents into Markdown/JSON and validating integrations with Postman.</li>
                          <li>Prototyped OCR and AI validation for handwritten pharmaceutical GMP records with Azure AI Foundry Agents and Copilot Studio, securing approval for production.</li>
                        </ul>
                      </ResumeProject>

                      <ResumeProject title="Web-workbench">
                        <ul>
                          <li>Built and deployed a Nuxt/Vue, Node.js and Firebase platform for SharePoint forms, site collections and document review workflows.</li>
                        </ul>
                      </ResumeProject>
                    </ResumeRole>
                  </ResumeExperience>
                </div>
              </section>

              <section class="mt-12">
                <ResumeSectionHeading index="03" title="Additional experience" />
                <div class="mt-7 divide-y divide-default">
                  <ResumeCompactRole
                    title="Web Developer (Project)"
                    company="Christ Covenant Church"
                    period="Oct 2024 - Jan 2025"
                  >
                    Gathered requirements and designed, built and deployed a responsive Wix Studio website with CMS
                    content, custom visual assets and mobile layouts.
                  </ResumeCompactRole>
                  <ResumeCompactRole
                    title="Software Developer"
                    company="Nexalab"
                    period="Feb 2024 - Apr 2024"
                  >
                    Designed wireframes and dashboard prototypes, documented third-party API integrations and
                    developed a React/Next.js feature.
                  </ResumeCompactRole>
                  <ResumeCompactRole
                    title="Game Developer"
                    company="Monash Connected Autonomous Vehicle"
                    period="Feb 2023 - Dec 2023"
                  >
                    Developed features, improved VR performance and resolved defects for a connected autonomous
                    vehicle simulation in Unreal Engine.
                  </ResumeCompactRole>
                </div>
              </section>
            </main>

            <aside class="border-t border-default bg-elevated/40 px-6 py-9 sm:px-10 sm:py-12 lg:border-l lg:border-t-0 lg:px-8">
              <section>
                <ResumeSectionHeading index="04" title="Technical stack" compact />
                <div class="mt-6 space-y-7">
                  <ResumeSkillGroup title="Full stack" :items="['Nuxt.js', 'Vue.js', 'TypeScript', 'Pinia', 'NestJS', 'Node.js', 'REST APIs', 'JWT', 'PostgreSQL', 'Firebase']" />
                  <ResumeSkillGroup title="Cloud & DevOps" :items="['AWS CDK', 'Cognito', 'Amplify', 'S3', 'EventBridge', 'Lambda', 'EC2', 'ECS', 'EKS', 'Docker', 'GitHub Actions', 'Azure DevOps', 'Bicep']" />
                  <ResumeSkillGroup title="AI & automation" :items="['Python', 'Azure AI Foundry', 'Copilot Studio', 'LangChain', 'RAG', 'Embeddings', 'Structured outputs', 'MCP', 'Codex', 'Claude', 'Power Automate', 'Logic Apps']" />
                  <ResumeSkillGroup title="Domain" :items="['Australian energy', 'AEMO / NEM', 'SCADA', 'Raspberry Pi', 'Data collection', 'GMP validation']" />
                </div>
              </section>

              <section class="mt-12">
                <ResumeSectionHeading index="05" title="Education" compact />
                <div class="mt-6">
                  <p class="font-semibold text-highlighted">
                    Bachelor of Engineering (Software)
                  </p>
                  <p class="mt-1 text-sm text-toned">
                    Monash University
                  </p>
                  <p class="mt-2 font-mono text-xs text-primary">
                    COMPLETED 2023
                  </p>
                  <p class="mt-4 text-sm leading-6 text-muted">
                    Software testing, agile development, databases, internet applications, iOS development and
                    software usability.
                  </p>
                </div>
              </section>

              <section class="mt-12">
                <ResumeSectionHeading index="06" title="Work rights" compact />
                <p class="mt-6 text-sm leading-6 text-toned">
                  Temporary Graduate visa (subclass 485), valid until May 2028, with full working rights in Australia.
                </p>
              </section>

              <UButton
                to="/leonardo-prasetyo-resume.pdf"
                target="_blank"
                label="Open original resume"
                trailing-icon="i-lucide-arrow-up-right"
                color="primary"
                variant="soft"
                block
                class="mt-12 font-mono"
              />
            </aside>
          </div>
        </article>
      </div>
    </template>
  </UDashboardPanel>
</template>
