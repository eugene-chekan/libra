import { expect, test } from '@playwright/test'

/**
 * The admin Users tab, against a real backend. Admin/non-admin branching is
 * covered by the component suite; the e2e session here is always the
 * seeded admin. What only a real server can show is the round trip.
 */
test.describe('admin users, in a real browser', () => {
  test('creates a user, edits it, and deletes it again', async ({ page, request }) => {
    const username = `e2e-user-${Date.now()}`

    await page.goto('/admin/users')
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible()

    await page.getByRole('button', { name: '+ Add User' }).click()
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Password').fill('correct-horse-battery')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByText(username)).toBeVisible()

    await page.getByRole('button', { name: `Edit ${username}` }).click()
    await page.getByLabel('Kindle address').fill(`${username}@kindle.com`)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(`${username}@kindle.com`)).toBeVisible()

    const afterEdit = await request.get('/api/users')
    const created = ((await afterEdit.json()) as { username: string }[]).find(
      (u) => u.username === username
    )
    expect(created).toBeTruthy()

    await page.getByRole('button', { name: `Delete ${username}` }).click()
    await expect(page.getByText(/Their shelves, personal tags/)).toBeVisible()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(page.getByText(username, { exact: true })).toBeHidden()
    const afterDelete = await request.get('/api/users')
    const usernames = ((await afterDelete.json()) as { username: string }[]).map((u) => u.username)
    expect(usernames).not.toContain(username)
  })

  test('the sidebar offers Admin, and it leads to the Users tab', async ({ page }) => {
    await page.goto('/library')
    await page.getByRole('link', { name: 'Admin' }).click()

    await expect(page).toHaveURL(/\/admin\/users$/)
    await expect(page.getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page')
  })
})
