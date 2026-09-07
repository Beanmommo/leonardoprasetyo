export interface LeonardoActivity {
  id: string
  date: string
  order: number
  title: string
  description: string
  imageUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface LeonardoActivitiesResponse {
  activities: LeonardoActivity[]
}

export interface LeonardoActivityResponse {
  activity: LeonardoActivity
}

export interface LeonardoActivityInput {
  date: string
  title: string
  description?: string
  removeImage?: boolean
}

export interface LeonardoActivityOrderInput {
  direction: 'up' | 'down'
}
