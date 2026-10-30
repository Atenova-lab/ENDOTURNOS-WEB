import {useState} from 'react'
import type {CoverageIssue} from '../lib/coverage'

export default function ReviewIssueButton({issue,onReview}:{issue:CoverageIssue;onReview:(issue:CoverageIssue)=>Promise<string|null>}){
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const review=async()=>{
  if(busy||!window.confirm(`¿Confirmas que la incidencia del ${issue.date} (${issue.title}) no necesita cobertura? Quedará resuelta y podrás reabrirla desde Incidencias.`))return
  setBusy(true);setError('')
  try{setError(await onReview(issue)??'')}catch{setError('No se pudo guardar la revisión. Vuelve a intentarlo.')}finally{setBusy(false)}
 }
 return <span className="review-issue-action"><button type="button" className="soft-button" disabled={busy} onClick={()=>void review()}>{busy?'Guardando…':'Incidencia revisada: sin cobertura necesaria'}</button>{error&&<small role="alert" className="form-message">{error}</small>}</span>
}
