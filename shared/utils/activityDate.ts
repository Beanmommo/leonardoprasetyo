const activityDateFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Australia/Melbourne'
})

const activityTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23', timeZone: 'Australia/Melbourne'
})

export function formatActivityDate(date: Date): string {
  return activityDateFormatter.format(date)
}

/** UTC seconds at the start of the displayed Melbourne calendar day. */
export function activityDayStart(date: string): number {
  const target = Date.parse(`${date}T00:00:00Z`)
  let candidate = target
  // Resolve the offset at local midnight, including daylight-saving transition
  // days. New UTC-midnight date-only rows and older timestamps share this range.
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = Object.fromEntries(activityTimeFormatter.formatToParts(new Date(candidate))
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)]))
    const displayed = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!)
    if (displayed === target) return candidate / 1000
    candidate += target - displayed
  }
  throw new Error('Could not resolve activity date')
}

export function followingActivityDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)
}
