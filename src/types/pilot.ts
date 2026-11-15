export type PilotEventType =
  | 'pilot_joined'
  | 'pre_survey_completed'
  | 'food_recognized'
  | 'diet_record_added'
  | 'ai_chat_sent'
  | 'intervention_simulated'
  | 'intervention_created'
  | 'intervention_day_completed'
  | 'intervention_day_skipped'
  | 'intervention_completed'
  | 'post_survey_completed'

export interface PilotBatch {
  id: string
  title: string
  institution: string
  inviteCode: string
  targetCount: number
  durationDays: number
  createdAt: number
  status: 'active' | 'closed'
}

export interface PilotPreSurvey {
  awareness: number
  persistence: number
  improvementKnowledge: number
  sweetDrinkControl: number
  submittedAt: number
}

export interface PilotPostSurvey {
  clarity: number
  executability: number
  selfUnderstanding: number
  continueIntent: number
  recommendScore: number
  acceptablePrice: 'free' | '9.9' | '19.9' | '29.9'
  feedback: string
  submittedAt: number
}

export interface PilotParticipant {
  id: string
  pilotId: string
  ageRange: string
  role: string
  goal: string
  concerns: string[]
  consentedAt: number
  joinedAt: number
  preSurvey?: PilotPreSurvey
  postSurvey?: PilotPostSurvey
}

export interface PilotEvent {
  id: string
  pilotId: string
  participantId: string
  type: PilotEventType
  timestamp: number
  metadata: Record<string, number | string | boolean>
}

export interface PilotStateSnapshot {
  batches: PilotBatch[]
  participants: PilotParticipant[]
  events: PilotEvent[]
  currentParticipantId: string | null
}
