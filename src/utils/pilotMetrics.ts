import type { PilotBatch, PilotEvent, PilotParticipant } from '@/types/pilot'

export interface PilotFunnelStep {
  key: string
  label: string
  value: number
  rate: number
}

export interface PilotMetrics {
  participants: number
  targetCount: number
  preSurveyCount: number
  postSurveyCount: number
  interventionUsers: number
  checkinUsers: number
  completedUsers: number
  sevenDayRetentionProxy: number
  interventionAdoption: number
  averageRecords: number
  averageRecommendScore: number | null
  paidIntentRate: number | null
  preKnowledgeAverage: number | null
  postExperienceAverage: number | null
  averageScoreChange: number | null
  sampleSufficient: boolean
  funnel: PilotFunnelStep[]
}

function rate(value: number, total: number): number {
  return total ? Math.round((value / total) * 100) : 0
}

function average(values: number[]): number | null {
  if (!values.length) return null
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
}

function uniqueParticipants(events: PilotEvent[], type: PilotEvent['type']): number {
  return new Set(events.filter(item => item.type === type).map(item => item.participantId)).size
}

export function calculatePilotMetrics(
  batch: PilotBatch | null,
  allParticipants: PilotParticipant[],
  allEvents: PilotEvent[]
): PilotMetrics {
  const participants = batch ? allParticipants.filter(item => item.pilotId === batch.id) : []
  const participantIds = new Set(participants.map(item => item.id))
  const events = batch
    ? allEvents.filter(item => item.pilotId === batch.id && participantIds.has(item.participantId))
    : []
  const total = participants.length
  const preSurveyCount = participants.filter(item => item.preSurvey).length
  const postSurveyCount = participants.filter(item => item.postSurvey).length
  const interventionUsers = uniqueParticipants(events, 'intervention_created')
  const checkinUsers = uniqueParticipants(events, 'intervention_day_completed')
  const completedUsers = uniqueParticipants(events, 'intervention_completed')
  const recordEvents = events.filter(item => item.type === 'diet_record_added').length
  const recommendScores = participants.flatMap(item =>
    item.postSurvey ? [Number(item.postSurvey.recommendScore)] : []
  )
  const paidAnswers = participants.flatMap(item => (item.postSurvey ? [item.postSurvey.acceptablePrice] : []))
  const preScores = participants.flatMap(item => {
    const survey = item.preSurvey
    return survey
      ? [(survey.awareness + survey.persistence + survey.improvementKnowledge + survey.sweetDrinkControl) / 4]
      : []
  })
  const postScores = participants.flatMap(item => {
    const survey = item.postSurvey
    return survey
      ? [(survey.clarity + survey.executability + survey.selfUnderstanding + survey.continueIntent) / 4]
      : []
  })
  const scoreChanges: number[] = []
  participants.forEach(participant => {
    const checkins = events
      .filter(item => item.participantId === participant.id && item.type === 'intervention_day_completed')
      .sort((left, right) => left.timestamp - right.timestamp)
    const first = Number(checkins[0]?.metadata.score)
    const last = Number(checkins.at(-1)?.metadata.score)
    if (checkins.length >= 2 && Number.isFinite(first) && Number.isFinite(last)) scoreChanges.push(last - first)
  })

  const funnelValues = [total, preSurveyCount, interventionUsers, checkinUsers, completedUsers, postSurveyCount]
  const funnelLabels = ['匿名加入', '完成前测', '创建微干预', '至少一次打卡', '完成 7 天', '完成后测']
  const funnel: PilotFunnelStep[] = funnelLabels.map((label, index) => ({
    key: `step-${index + 1}`,
    label,
    value: funnelValues[index],
    rate: rate(funnelValues[index], total)
  }))

  return {
    participants: total,
    targetCount: batch?.targetCount || 0,
    preSurveyCount,
    postSurveyCount,
    interventionUsers,
    checkinUsers,
    completedUsers,
    sevenDayRetentionProxy: rate(completedUsers, total),
    interventionAdoption: rate(interventionUsers, total),
    averageRecords: total ? Math.round((recordEvents / total) * 10) / 10 : 0,
    averageRecommendScore: average(recommendScores),
    paidIntentRate: paidAnswers.length
      ? rate(paidAnswers.filter(item => item !== 'free').length, paidAnswers.length)
      : null,
    preKnowledgeAverage: average(preScores),
    postExperienceAverage: average(postScores),
    averageScoreChange: average(scoreChanges),
    sampleSufficient: total >= 5,
    funnel
  }
}
