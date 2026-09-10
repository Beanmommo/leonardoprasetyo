export type LeonardoActivityType = 'activity' | 'milestone'

export interface LeonardoActivity {
  id: string
  type: LeonardoActivityType
  date: string
  order: number
  title: string
  description: string
  imageUrl: string | null
  createdAt: string
  updatedAt: string
  contentMarkdown?: string | null
}

export type LeonardoActivityMapEntry = Pick<LeonardoActivity, 'id' | 'type' | 'title' | 'date'>

export interface LeonardoActivityMapResponse {
  activities: LeonardoActivityMapEntry[]
}

export interface LeonardoActivitiesResponse {
  activities: LeonardoActivity[]
}

export interface LeonardoActivitiesPageResponse extends LeonardoActivitiesResponse {
  nextCursor: string | null
}

export interface LeonardoActivityResponse {
  activity: LeonardoActivity
}

export interface LeonardoActivityInput {
  type?: LeonardoActivityType
  date: string
  title: string
  description?: string
  contentMarkdown?: string | null
  removeImage?: boolean
}

export interface LeonardoActivityOrderInput {
  direction: 'up' | 'down'
}
