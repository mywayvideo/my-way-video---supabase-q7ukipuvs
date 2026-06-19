export interface AuthFormData {
  full_name?: string
  email: string
  password?: string
  confirm_password?: string
  accept_terms?: boolean
}

export interface AuthResponse {
  success: boolean
  error?: string
  token?: string
}
