import { createHash } from 'node:crypto'
import { resolveNavTarget } from './assistant/actions.ts'
import type { Prepared, Proposal, ProposalTool } from './assistant/proposals.ts'
import {
  completeOracleMessage,
  OracleQueueConflictError,
  type OracleMessage,
  type OracleQueueBackend,
  type OracleUiAction,
  type OracleUiProposal,
} from './oracleQueue.ts'

const WRITE_TOOLS = new Set<ProposalTool>([
  'create_note',
  'create_goal',
  'complete_habit_today',
  'create_alert',
])

export type OracleRawInteraction = {
  action?: { target?: unknown } | null
  proposal?: { tool?: unknown; input?: unknown } | null
} | null

type FinalizeInput = {
  backend: OracleQueueBackend
  id: string
  claimToken: string
  answer: string
  sessionId: string | null
  interaction?: OracleRawInteraction
}

type FinalizeDeps = {
  now(): number
  prepareProposal(tool: ProposalTool, input: unknown, user: OracleMessage['owner']): Promise<Prepared>
  saveProposal(proposal: Proposal): Promise<void>
}

export async function isOracleProposalActive(
  backend: OracleQueueBackend,
  proposal: Proposal,
): Promise<boolean> {
  if (!proposal.oracleMessageId) return true
  const source = await backend.get(proposal.oracleMessageId)
  return source?.owner === proposal.user
    && source.status === 'completed'
    && source.proposal?.id === proposal.id
}

function proposalId(messageId: string, claimToken: string, proposal: Proposal): string {
  const hex = createHash('sha256')
    .update(JSON.stringify([
      'arxcian-oracle-proposal',
      messageId,
      claimToken,
      proposal.user,
      proposal.tool,
      proposal.args,
      proposal.summary,
    ]))
    .digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function withInteractionWarning(answer: string): string {
  const warning = 'Pyydettyä käyttöliittymätoimintoa ei voitu valmistella turvallisesti.'
  return answer.trim() ? `${answer.trimEnd()}\n\n${warning}` : warning
}

export async function finalizeOracleCompletion(
  input: FinalizeInput,
  deps: FinalizeDeps,
): Promise<OracleMessage> {
  const current = await input.backend.get(input.id)
  const terminalReplay = current?.status === 'completed'
    && current.terminalClaimToken === input.claimToken
  if (!current || (!terminalReplay
    && (current.claimToken !== input.claimToken || !['claimed', 'running'].includes(current.status)))) {
    throw new OracleQueueConflictError('Oracle-viestin lunastus ei ole enää voimassa.')
  }
  const completedAt = terminalReplay ? current.updatedAt : deps.now()

  let action: OracleUiAction | null = null
  let publicProposal: OracleUiProposal | null = null
  let savedProposal: Proposal | null = null
  let invalid = false
  const interaction = input.interaction

  if (interaction?.action) {
    const resolved = resolveNavTarget(interaction.action)
    if (resolved.ok) {
      action = {
        action: 'navigate',
        href: resolved.target.href,
        label: resolved.target.label,
      }
    } else {
      invalid = true
    }
  }

  if (interaction?.proposal) {
    const tool = interaction.proposal.tool
    if (typeof tool !== 'string' || !WRITE_TOOLS.has(tool as ProposalTool)) {
      invalid = true
    } else {
      const prepared = await deps.prepareProposal(
        tool as ProposalTool,
        interaction.proposal.input,
        current.owner,
      )
      if (!prepared.ok) {
        invalid = true
      } else {
        savedProposal = {
          ...prepared.proposal,
          id: proposalId(current.id, input.claimToken, prepared.proposal),
          createdAt: completedAt,
          oracleMessageId: current.id,
        }
        await deps.saveProposal(savedProposal)
        publicProposal = {
          id: savedProposal.id,
          tool: savedProposal.tool,
          summary: savedProposal.summary,
        }
      }
    }
  }

  return completeOracleMessage(
    input.backend,
    input.id,
    input.claimToken,
    invalid ? withInteractionWarning(input.answer) : input.answer,
    completedAt,
    input.sessionId,
    { action, proposal: publicProposal },
  )
}
