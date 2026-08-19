// Päivätehtävien ryhmittely, järjestys ja syötteen normalisointi.
//
// Nämä ovat ne kohdat joissa väärä tulos ei näy virheenä vaan hiljaisena
// vääränä päivänä: myöhässä oleva tehtävä ryhmittyy "myöhemmäksi", tai
// kesäaikasiirtymä siirtää "huomisen" kahdella päivällä.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dueToday,
  groupOf,
  localDate,
  normalizeDate,
  normalizeTime,
  reminderMs,
  shiftDays,
  sortTodos,
} from './todoGroups.ts'
import type { Todo } from './types'

function todo(patch: Partial<Todo> = {}): Todo {
  return {
    id: patch.id ?? 'x',
    owner: 'albin',
    title: 'tehtävä',
    date: null,
    remindAt: null,
    done: false,
    createdAt: 0,
    completedAt: null,
    ...patch,
  }
}

test('normalizeDate hylkää muun kuin YYYY-MM-DD:n', () => {
  assert.equal(normalizeDate('2026-08-20'), '2026-08-20')
  assert.equal(normalizeDate('20.8.2026'), null)
  assert.equal(normalizeDate('2026-8-2'), null)
  assert.equal(normalizeDate(null), null)
  assert.equal(normalizeDate(20260820), null)
})

test('normalizeTime vaatii päivän ankkurikseen', () => {
  assert.equal(normalizeTime('09:30', '2026-08-20'), '09:30')
  // Ilman päivää kellonajalla ei ole mihin kiinnittyä, ks. Todo.remindAt.
  assert.equal(normalizeTime('09:30', null), null)
  assert.equal(normalizeTime('9:30', '2026-08-20'), null)
})

test('shiftDays kestää kesäajan lopun', () => {
  // Suomessa kello siirtyy 25.10.2026 yöllä. Keskiyöstä laskettuna
  // +1 vrk osuisi edelliseen päivään; keskipäivä pitää päivän oikeana.
  assert.equal(shiftDays('2026-10-24', 1), '2026-10-25')
  assert.equal(shiftDays('2026-10-25', 1), '2026-10-26')
  // Ja kevään siirtymä 29.3.2026.
  assert.equal(shiftDays('2026-03-28', 1), '2026-03-29')
  assert.equal(shiftDays('2026-03-29', 1), '2026-03-30')
  // Kuukauden ja vuoden vaihde.
  assert.equal(shiftDays('2026-08-31', 1), '2026-09-01')
  assert.equal(shiftDays('2026-12-31', 1), '2027-01-01')
})

test('localDate lukee paikallisen kalenteripäivän, ei UTC:n', () => {
  // Paikallinen 20.8. klo 01:00 on UTC:ssa vielä 19.8. Suomen kesäajassa.
  assert.equal(localDate(new Date(2026, 7, 20, 1, 0)), '2026-08-20')
  assert.equal(localDate(new Date(2026, 0, 5)), '2026-01-05')
})

test('groupOf jakaa viiteen ryhmään suhteessa tähän päivään', () => {
  const today = '2026-08-20'
  assert.equal(groupOf(todo({ date: null }), today), 'joskus')
  assert.equal(groupOf(todo({ date: '2026-08-19' }), today), 'myohassa')
  assert.equal(groupOf(todo({ date: '2026-08-20' }), today), 'tanaan')
  assert.equal(groupOf(todo({ date: '2026-08-21' }), today), 'huomenna')
  assert.equal(groupOf(todo({ date: '2026-08-22' }), today), 'myohemmin')
  // Vuosi vaihtuu: merkkijonovertailu ei saa pitää tammikuuta menneenä.
  assert.equal(groupOf(todo({ date: '2027-01-02' }), '2026-12-31'), 'myohemmin')
})

test('dueToday ottaa myöhässä olevat mukaan mutta jättää tehdyt pois', () => {
  const today = '2026-08-20'
  const kaikki = [
    todo({ id: 'a', date: '2026-08-18' }),
    todo({ id: 'b', date: today }),
    todo({ id: 'c', date: today, done: true }),
    todo({ id: 'd', date: '2026-08-21' }),
    todo({ id: 'e', date: null }),
  ]
  assert.deepEqual(
    dueToday(kaikki, today).map(t => t.id),
    ['a', 'b'],
  )
})

test('sortTodos: ajoitetut ensin, päivättömät perään, tehdyt viimeisenä', () => {
  const lista = [
    todo({ id: 'tehty', date: '2026-08-01', done: true }),
    todo({ id: 'paivaton' }),
    todo({ id: 'myohemmin', date: '2026-08-25' }),
    todo({ id: 'aikaisin', date: '2026-08-20', remindAt: '08:00' }),
    todo({ id: 'myohaan', date: '2026-08-20', remindAt: '17:00' }),
    todo({ id: 'kelloton', date: '2026-08-20' }),
  ]
  assert.deepEqual(
    sortTodos(lista).map(t => t.id),
    ['aikaisin', 'myohaan', 'kelloton', 'myohemmin', 'paivaton', 'tehty'],
  )
})

test('sortTodos ei muuta alkuperäistä listaa', () => {
  const lista = [todo({ id: 'b', date: '2026-08-25' }), todo({ id: 'a', date: '2026-08-20' })]
  sortTodos(lista)
  assert.deepEqual(
    lista.map(t => t.id),
    ['b', 'a'],
  )
})

test('reminderMs vaatii sekä päivän että kellonajan', () => {
  assert.equal(reminderMs(todo({ date: '2026-08-20' })), null)
  assert.equal(reminderMs(todo({ remindAt: '09:00' })), null)
  assert.equal(
    reminderMs(todo({ date: '2026-08-20', remindAt: '09:00' })),
    new Date(2026, 7, 20, 9, 0).getTime(),
  )
})
