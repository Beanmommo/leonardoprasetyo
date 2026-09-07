import { Client } from 'langsmith'
import { LangSmithTelemetry } from 'langsmith/experimental/vercel'
import { RunTree } from 'langsmith/run_trees'
import { traceable, withRunTree } from 'langsmith/traceable'
import type { CloudflareRuntimeBindings } from './cloudflareBindings'

export function createChatTracing(env: Readonly<CloudflareRuntimeBindings>, question: string) {
  const enabled = env.LANGSMITH_TRACING === 'true' && Boolean(env.LANGSMITH_API_KEY)
  const project = env.LANGSMITH_PROJECT || 'leonardo-chat-dev'
  // Request-scoped clients prevent development and production keys or traces
  // being mixed through a global LangSmith client or telemetry registration.
  const client = enabled
    ? new Client({
        apiKey: env.LANGSMITH_API_KEY,
        apiUrl: env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com',
        workspaceId: env.LANGSMITH_WORKSPACE_ID,
        timeout_ms: 5000,
        callerOptions: { maxRetries: 1 },
        maxIngestMemoryBytes: 2 * 1024 * 1024,
        omitTracedRuntimeInfo: true
      })
    : undefined
  const root = client
    ? new RunTree({
        name: 'portfolio-chat',
        run_type: 'chain',
        project_name: project,
        client,
        tracingEnabled: true,
        inputs: { question },
        metadata: {
          environment: env.APP_ENVIRONMENT,
          database: env.ACTIVITY_DATABASE_NAME,
          route: 'portfolio-chat'
        }
      })
    : new RunTree({ name: 'portfolio-chat', tracingEnabled: false })

  const reportFailure = () => console.warn(JSON.stringify({
    message: 'LangSmith trace delivery failed',
    code: 'CHAT_TRACING_ERROR'
  }))

  return {
    enabled,
    telemetry: client
      ? {
          integrations: [LangSmithTelemetry({
            client,
            projectName: project,
            name: 'portfolio-answer',
            tracingEnabled: true,
            traceRawHttp: false
          })]
        }
      : undefined,
    async start() {
      if (client) await root.postRun().catch(reportFailure)
    },
    run<T>(operation: () => Promise<T>): Promise<T> {
      return withRunTree(root, operation)
    },
    async retrieve<T>(question: string, operation: (question: string) => Promise<T>): Promise<T> {
      if (!client) return withRunTree(root, () => operation(question))
      return withRunTree(root, () => traceable(operation, {
        name: 'retrieve_library_context',
        run_type: 'retriever',
        client,
        project_name: project,
        tracingEnabled: true
      })(question))
    },
    async finish(outputs: Record<string, unknown>, error?: string) {
      if (!client) return
      try {
        await root.end(outputs, error)
        await root.patchRun()
        await client.awaitPendingTraceBatches()
      } catch {
        reportFailure()
      }
    }
  }
}
