import '@testing-library/jest-dom'

// Mock fetch
global.fetch = jest.fn()

// Mock Request for Next.js API tests
global.Request = jest.fn().mockImplementation((url, options = {}) => ({
  url,
  method: options.method || 'GET',
  headers: new Headers(options.headers),
  body: options.body,
  json: jest.fn().mockImplementation(() => {
    try {
      return Promise.resolve(JSON.parse(options.body || '{}'))
    } catch {
      return Promise.reject(new SyntaxError('Unexpected token'))
    }
  }),
}))

// Mock Response and Response.json for Next.js API tests
const ResponseMock = jest.fn().mockImplementation((body, options = {}) => ({
  status: options.status || 200,
  headers: new Headers(options.headers),
  json: jest.fn().mockResolvedValue(JSON.parse(body || '{}')),
}))

// Add static json method to Response
ResponseMock.json = jest.fn().mockImplementation((data, options = {}) => ({
  status: options.status || 200,
  headers: new Headers(options.headers),
  json: jest.fn().mockResolvedValue(data),
}))

global.Response = ResponseMock

// Mock Headers
global.Headers = jest.fn().mockImplementation((headers = {}) => {
  const map = new Map()
  // Initialize with provided headers, converting keys to lowercase
  Object.entries(headers).forEach(([key, value]) => {
    map.set(key.toLowerCase(), value)
  })
  return {
    get: (key) => map.get(key.toLowerCase()),
    set: (key, value) => map.set(key.toLowerCase(), value),
    has: (key) => map.has(key.toLowerCase()),
    delete: (key) => map.delete(key.toLowerCase()),
    entries: () => map.entries(),
    keys: () => map.keys(),
    values: () => map.values(),
  }
})

// Mock MediaStream
global.MediaStream = jest.fn().mockImplementation(() => ({
  addTrack: jest.fn(),
  removeTrack: jest.fn(),
  getTracks: jest.fn().mockReturnValue([]),
}))

// Mock HTMLElement methods
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  writable: true,
  value: jest.fn(),
})

// Mock navigator.mediaDevices
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    enumerateDevices: jest.fn().mockResolvedValue([]),
    getUserMedia: jest.fn().mockResolvedValue(new MediaStream()),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
  writable: true,
})

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}
global.localStorage = localStorageMock