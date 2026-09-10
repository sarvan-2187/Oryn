/** Fills a throwaway database with believable data for visual checks. */
import { getDb, closeDb } from '../src/main/db/connection'
import * as spaces from '../src/main/db/queries/spaces'
import * as tasks from '../src/main/db/queries/tasks'
import * as habits from '../src/main/db/queries/habits'
import { addDays, today } from '../src/shared/dates'

getDb()
const [academic, research, hack] = spaces.listSpaces()
const day = today()

tasks.createTask({ spaceId: academic.id, title: 'DBMS assignment 3', dueDate: addDays(day, -2), priority: 'high' })
const os = tasks.createTask({ spaceId: academic.id, title: 'OS lab record', dueDate: day, priority: 'med' })
tasks.createTask({ spaceId: academic.id, title: 'Draw the scheduling diagrams', parentId: os.id })
tasks.createTask({ spaceId: academic.id, title: 'Write the conclusion', parentId: os.id })
tasks.createTask({ spaceId: research.id, title: 'Read the transformer paper', dueDate: day, priority: 'low' })
tasks.createTask({ spaceId: academic.id, title: 'Daily revision', dueDate: day, recurRule: 'daily' })
tasks.createTask({ spaceId: hack.id, title: 'Ship the demo video', dueDate: addDays(day, 4), priority: 'high' })

const gym = habits.createHabit({ spaceId: academic.id, name: 'Gym', color: '#30a46c' })
const leet = habits.createHabit({ spaceId: academic.id, name: 'LeetCode', kind: 'count', target: 2, unit: 'problems', color: '#4d7ea8' })
const read = habits.createHabit({ spaceId: research.id, name: 'Read', kind: 'count', target: 30, unit: 'pages', color: '#a855f7' })
const sleep = habits.createHabit({ spaceId: academic.id, name: 'Sleep by 12', color: '#f5a524' })

for (let i = 0; i < 26; i++) {
  const d = addDays(day, -i)
  if (i % 5 !== 3) habits.toggleHabit(gym.id, d)
  if (i % 3 !== 0) habits.setHabitValue(leet.id, d, 2)
  if (i % 4 !== 1) habits.setHabitValue(read.id, d, 30)
  if (i % 7 !== 2) habits.toggleHabit(sleep.id, d)
}
habits.setHabitValue(leet.id, day, 1) // partly done today

closeDb()
console.log('demo data seeded')
