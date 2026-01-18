import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createSession,
  fetchHistory,
  fetchSession,
  submitAction,
} from './client'
import type { ActionResponse, SessionResponse } from './types'

type ActionArgs = { actionId: number; stateVersion: number }

type Options = { autoStart?: boolean }

export function useGameSession(options: Options = {}) {
  const queryClient = useQueryClient()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const hasStartedRef = useRef(false)

  const createSessionMutation = useMutation({
    mutationFn: createSession,
    onSuccess: (data) => {
      setSessionId(data.session_id)
      queryClient.setQueryData(['session', data.session_id], data)
    },
  })

  const sessionQuery = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => fetchSession(sessionId as string),
    enabled: Boolean(sessionId),
    refetchInterval: (data: SessionResponse | undefined) =>
      data?.ai_thinking ? 1500 : false,
  })

  const historyQuery = useQuery({
    queryKey: ['history', sessionId],
    queryFn: () => fetchHistory(sessionId as string),
    enabled: Boolean(sessionId),
  })

  const actionMutation = useMutation({
    mutationFn: ({ actionId, stateVersion }: ActionArgs) =>
      submitAction(sessionId as string, stateVersion, actionId),
    onSuccess: (data: ActionResponse) => {
      queryClient.setQueryData(
        ['session', sessionId],
        (prev?: SessionResponse) =>
          prev
            ? {
                ...prev,
                state: data.state,
                legal_actions: data.legal_actions,
                state_version: data.state_version,
                ai_thinking: false,
              }
            : prev,
      )
      queryClient.invalidateQueries({ queryKey: ['history', sessionId] })
    },
  })

  const startNewSession = () => {
    const previousSession = sessionId
    if (previousSession) {
      queryClient.removeQueries({ queryKey: ['session', previousSession] })
      queryClient.removeQueries({ queryKey: ['history', previousSession] })
    }
    setSessionId(null)
    createSessionMutation.mutate()
  }

  useEffect(() => {
    if (options.autoStart === false) return
    if (!sessionId && !createSessionMutation.isPending && !hasStartedRef.current) {
      hasStartedRef.current = true
      createSessionMutation.mutate()
    }
  }, [options.autoStart, sessionId, createSessionMutation])

  const error = createSessionMutation.error ?? sessionQuery.error ?? null
  const isLoading =
    createSessionMutation.isPending ||
    sessionQuery.isPending ||
    (!sessionId && !error)

  return {
    sessionId,
    session: sessionQuery.data ?? createSessionMutation.data ?? null,
    history: historyQuery.data ?? null,
    isLoading,
    error,
    submitAction: actionMutation.mutate,
    isSubmitting: actionMutation.isPending,
    startNewSession,
  }
}
