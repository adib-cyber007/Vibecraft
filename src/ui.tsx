import { X, PenTool, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, Children, cloneElement, isValidElement, type ReactNode, type ReactElement } from 'react';
export function Logo(){return <span className="brand"><span className="brand-symbol"><PenTool size={20}/></span><span>vibecraft<span className="brand-dot">.</span></span></span>;}
export function IconButton({icon:Icon,label,onClick,disabled,active}:{icon:LucideIcon;label:string;onClick:()=>void;disabled?:boolean;active?:boolean}){return <button className={'icon-button'+(active?' active':'')} title={label} aria-label={label} disabled={disabled} onClick={onClick}><Icon size={17}/></button>;}
export function Field({label,children}:{label:string;children:ReactNode}){return <label className="field"><span>{label}</span>{Children.map(children,child=>isValidElement(child)&&typeof child.type==='string'&&['input','select','textarea'].includes(child.type)?cloneElement(child as ReactElement<{'aria-label'?:string}>,{'aria-label':(child.props as {'aria-label'?:string})['aria-label']||label}):child)}</label>;}
export function NumberField({label,value,onChange,min,max,step=1}:{label:string;value:number;onChange:(value:number)=>void;min?:number;max?:number;step?:number}) {
  return <Field label={label}><input aria-label={label} type="number" value={Number(value.toFixed(2))} min={min} max={max} step={step} onChange={e=>{const n=e.target.valueAsNumber;if(Number.isFinite(n))onChange(Math.max(min??-100000,Math.min(max??100000,n)));}}/></Field>;
}
export function Dialog({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}){
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
  return <dialog ref={dialog} className={'dialog'+(wide?' wide':'')} onCancel={onClose} onClick={e=>{if(e.target===dialog.current)onClose();}}><header><h2>{title}</h2><IconButton icon={X} label="Close dialog" onClick={onClose}/></header>{children}</dialog>;
}
