import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthContext } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Video } from 'lucide-react'

export default function Signup() {
  const navigate = useNavigate()
  const { signUp } = useAuthContext()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await signUp(email, password, name)
    setLoading(false)
    if (error) {
      toast({ title: 'Erro ao criar conta', description: error.message, variant: 'destructive' })
    } else {
      toast({
        title: 'Conta criada',
        description: 'Por favor, confirme seu email ou faça login se autoconfirmado.',
      })
      navigate('/login')
    }
  }

  return (
    <div className="container mx-auto flex items-center justify-center min-h-[80vh] px-4 animate-fade-in">
      <Card className="w-full max-w-md bg-card/50 border-white/10 shadow-elevation backdrop-blur-sm">
        <CardHeader className="space-y-3 items-center text-center">
          <div className="bg-accent text-accent-foreground p-3 rounded-xl mb-2">
            <Video className="w-6 h-6" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Criar Conta</CardTitle>
          <CardDescription>Cadastre-se na My Way Video.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome Completo</Label>
              <Input
                id="name"
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="bg-background/50 border-white/10 focus-visible:ring-accent"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="nome@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-background/50 border-white/10 focus-visible:ring-accent"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="bg-background/50 border-white/10 focus-visible:ring-accent"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={loading}
            >
              {loading ? 'Criando...' : 'Cadastrar'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 text-center">
          <p className="text-sm text-muted-foreground">
            Já possui uma conta?{' '}
            <Link to="/login" className="text-accent hover:underline font-medium">
              Entrar
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
