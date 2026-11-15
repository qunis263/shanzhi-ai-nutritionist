import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { readJSON, STORAGE_KEYS, writeJSON } from '@/utils/storage'
import type {
  PilotBatch,
  PilotEvent,
  PilotEventType,
  PilotParticipant,
  PilotPostSurvey,
  PilotPreSurvey,
  PilotStateSnapshot
} from '@/types/pilot'

const DEFAULT_BATCH: PilotBatch = {
  id: 'campus-nutrition-2026',
  title: '高校学生健康饮食 7 天试点',
  institution: '省赛示范批次',
  inviteCode: 'SHANZHI2026',
  targetCount: 30,
  durationDays: 7,
  createdAt: Date.UTC(2026, 10, 14),
  status: 'active'
}

function randomId(prefix: string): string {
  const values = new Uint32Array(2)
  crypto.getRandomValues(values)
  return `${prefix}-${values[0].toString(36)}${values[1].toString(36)}`
}

function loadSnapshot(): PilotStateSnapshot {
  const stored = readJSON(STORAGE_KEYS.pilot, null) as Partial<PilotStateSnapshot> | null
  return {
    batches: Array.isArray(stored?.batches) && stored.batches.length ? stored.batches : [DEFAULT_BATCH],
    participants: Array.isArray(stored?.participants) ? stored.participants : [],
    events: Array.isArray(stored?.events) ? stored.events : [],
    currentParticipantId: stored?.currentParticipantId || null
  }
}

export const usePilotStore = defineStore('pilot', () => {
  const initial = loadSnapshot()
  const batches = ref<PilotBatch[]>(initial.batches)
  const participants = ref<PilotParticipant[]>(initial.participants)
  const events = ref<PilotEvent[]>(initial.events)
  const currentParticipantId = ref<string | null>(initial.currentParticipantId)

  const currentParticipant = computed(
    () => participants.value.find(item => item.id === currentParticipantId.value) || null
  )
  const currentBatch = computed(
    () => batches.value.find(item => item.id === currentParticipant.value?.pilotId) || batches.value[0] || null
  )

  function createBatch(input: {
    title: string
    institution: string
    targetCount: number
    durationDays?: number
  }): PilotBatch {
    const batch: PilotBatch = {
      id: randomId('pilot'),
      title: input.title.trim(),
      institution: input.institution.trim(),
      inviteCode: `SZ${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      targetCount: Math.max(5, Math.round(input.targetCount || 30)),
      durationDays: Math.max(3, Math.min(30, Math.round(input.durationDays || 7))),
      createdAt: Date.now(),
      status: 'active'
    }
    batches.value.unshift(batch)
    return batch
  }

  function joinPilot(input: {
    inviteCode: string
    ageRange: string
    role: string
    goal: string
    concerns: string[]
    consent: boolean
  }): { ok: boolean; message: string; participant?: PilotParticipant } {
    if (!input.consent) return { ok: false, message: '请先阅读并同意匿名数据授权说明' }
    const batch = batches.value.find(
      item => item.status === 'active' && item.inviteCode.toUpperCase() === input.inviteCode.trim().toUpperCase()
    )
    if (!batch) return { ok: false, message: '邀请码无效或试点已经结束' }
    const participant: PilotParticipant = {
      id: randomId('P'),
      pilotId: batch.id,
      ageRange: input.ageRange,
      role: input.role,
      goal: input.goal,
      concerns: [...input.concerns],
      consentedAt: Date.now(),
      joinedAt: Date.now()
    }
    participants.value.push(participant)
    currentParticipantId.value = participant.id
    track('pilot_joined', { role: participant.role, goal: participant.goal })
    return { ok: true, message: `已匿名加入“${batch.title}”`, participant }
  }

  function submitPreSurvey(input: Omit<PilotPreSurvey, 'submittedAt'>): void {
    if (!currentParticipant.value) return
    currentParticipant.value.preSurvey = { ...input, submittedAt: Date.now() }
    track('pre_survey_completed')
  }

  function submitPostSurvey(input: Omit<PilotPostSurvey, 'submittedAt'>): void {
    if (!currentParticipant.value) return
    currentParticipant.value.postSurvey = {
      ...input,
      feedback: input.feedback.trim().slice(0, 300),
      submittedAt: Date.now()
    }
    track('post_survey_completed', {
      recommendScore: input.recommendScore,
      acceptablePrice: input.acceptablePrice
    })
  }

  function track(type: PilotEventType, metadata: PilotEvent['metadata'] = {}): void {
    const participant = currentParticipant.value
    if (!participant) return
    events.value.push({
      id: randomId('E'),
      pilotId: participant.pilotId,
      participantId: participant.id,
      type,
      timestamp: Date.now(),
      metadata: { ...metadata }
    })
    if (events.value.length > 2000) events.value = events.value.slice(-2000)
  }

  function selectParticipant(id: string | null): void {
    currentParticipantId.value = participants.value.some(item => item.id === id) ? id : null
  }

  watch(
    [batches, participants, events, currentParticipantId],
    () => {
      writeJSON(STORAGE_KEYS.pilot, {
        batches: batches.value,
        participants: participants.value,
        events: events.value,
        currentParticipantId: currentParticipantId.value
      })
    },
    { deep: true }
  )

  return {
    batches,
    participants,
    events,
    currentParticipantId,
    currentParticipant,
    currentBatch,
    createBatch,
    joinPilot,
    submitPreSurvey,
    submitPostSurvey,
    track,
    selectParticipant
  }
})
