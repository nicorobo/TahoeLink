import type { PageLoad } from "./$types"
import { browser } from '$app/environment'

export const load: PageLoad = async ({ fetch }) => {
    try {
        // Use different URLs for browser vs SSR
        const apiUrl = '/api/rooms'
        console.log('Fetching from:', apiUrl, 'Browser:', browser)

        const response = await fetch(apiUrl)
        console.log('Response status:', response.status, response.statusText)

        if (!response.ok) {
            console.error('Response not ok:', response.status, response.statusText)
            return { rooms: [] }
        }

        const data = await response.json()
        console.log('Fetched rooms data:', data)

        // Handle both { rooms: [...] } and direct array responses
        const rooms = data.rooms || data || []
        return { rooms }

    } catch (error) {
        console.error('Error fetching rooms:', error)
        return { rooms: [] }
    }
}