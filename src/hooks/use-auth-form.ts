import { useState } from 'react'
import { AuthFormData } from '@/types/auth'
import { AUTH_MESSAGES } from '@/constants/auth'

type ValidationErrors = Partial<Record<keyof AuthFormData, string>>

export function useAuthForm(mode: 'login' | 'signup') {
  const [formData, setFormData] = useState<AuthFormData>({
    email: '',
    password: '',
    full_name: '',
    confirm_password: '',
    accept_terms: false,
  })
  const [errors, setErrors] = useState<ValidationErrors>({})

  const validate = (): boolean => {
    const newErrors: ValidationErrors = {}
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!formData.email || !emailRegex.test(formData.email)) {
      newErrors.email = 'E-mail inválido'
    }

    if (!formData.password || formData.password.length < 8) {
      newErrors.password = 'A senha deve ter pelo menos 8 caracteres'
    }

    if (mode === 'signup') {
      if (!formData.full_name || formData.full_name.length < 3) {
        newErrors.full_name = 'O nome deve ter pelo menos 3 caracteres'
      }
      if (formData.password !== formData.confirm_password) {
        newErrors.confirm_password = 'As senhas não coincidem'
      }
      if (!formData.accept_terms) {
        newErrors.accept_terms = 'Você deve aceitar os termos'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const updateField = (field: keyof AuthFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  const isValid = () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!formData.email || !emailRegex.test(formData.email)) return false
    if (!formData.password || formData.password.length < 8) return false

    if (mode === 'signup') {
      if (!formData.full_name || formData.full_name.length < 3) return false
      if (formData.password !== formData.confirm_password) return false
      if (!formData.accept_terms) return false
    }

    return true
  }

  const mapAuthError = (errorMsg: string): string => {
    const msg = errorMsg.toLowerCase()
    if (msg.includes('invalid login credentials')) return AUTH_MESSAGES.INVALID_CREDENTIALS
    if (msg.includes('user already exists')) return AUTH_MESSAGES.USER_EXISTS
    if (msg.includes('password should be at least')) return AUTH_MESSAGES.WEAK_PASSWORD
    if (msg.includes('network') || msg.includes('fetch')) return AUTH_MESSAGES.NETWORK_ERROR
    return AUTH_MESSAGES.DEFAULT_ERROR
  }

  return {
    formData,
    errors,
    updateField,
    validate,
    isValid: isValid(),
    mapAuthError,
  }
}
