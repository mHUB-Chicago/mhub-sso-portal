"use client"

import { useState } from "react"
import { type ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Eye, Pencil } from "lucide-react"
import { Link } from "react-router-dom"
import type { User, Company } from "@/store/api/userApi"
import type { ServiceProvider } from "@/store/api/serviceProviderApi"
import { UserViewModal } from "@/components/UserViewModal"
import { CompanyViewModal } from "@/components/CompanyViewModal"

export type UserWithCompany = User & {
  companyName?: string
}

function UserActionsCell({ user }: { user: UserWithCompany }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => setOpen(true)} className="text-muted-foreground hover:text-foreground">
        <Eye className="h-4 w-4" />
      </button>
      <Link to={`/admin/users/${user.id}/edit`} className="text-muted-foreground hover:text-foreground">
        <Pencil className="h-4 w-4" />
      </Link>
      <UserViewModal user={user} open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

function CompanyActionsCell({ company }: { company: Company }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => setOpen(true)} className="text-muted-foreground hover:text-foreground">
        <Eye className="h-4 w-4" />
      </button>
      <Link to={`/admin/companies/${company.id}/edit`} className="text-muted-foreground hover:text-foreground">
        <Pencil className="h-4 w-4" />
      </Link>
      <CompanyViewModal company={company} open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

export const createUserColumns = (portalAccessTypes: Set<string>): ColumnDef<UserWithCompany>[] => [
  {
    id: "actions",
    header: "Actions",
    size: 80,
    cell: ({ row }) => <UserActionsCell user={row.original} />,
  },
  {
    accessorKey: "name",
    header: "Full Name",
    size: 260,
    cell: ({ row }) => {
      const user = row.original
      const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase()
      return (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.profilePhoto ?? undefined} alt={user.name} className="object-cover" />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">{user.name}</div>
            <div className="text-sm text-muted-foreground">{user.email}</div>
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: "peopleVineId",
    header: "PeopleVine ID",
    size: 140,
    cell: ({ row }) => {
      const val = row.original.peopleVineId
      return <span className="text-sm">{val ?? <span className="text-muted-foreground">—</span>}</span>
    },
  },
  {
    accessorKey: "companyName",
    header: "Company",
    size: 200,
    cell: ({ row }) => <span>{row.original.companyName || '-'}</span>,
  },
  {
    accessorKey: "primaryMembership",
    header: "Primary Membership",
    size: 200,
    cell: ({ row }) => {
      const val = row.original.primaryMembership
      return <span className="text-sm">{val ?? <span className="text-muted-foreground">—</span>}</span>
    },
  },
  {
    id: "addOns",
    header: "Add-ons",
    size: 200,
    cell: ({ row }) => {
      const raw = row.original.addOns
      let addOns: string[] = []
      try { addOns = JSON.parse(raw) } catch {}
      if (addOns.length === 0) return <span className="text-muted-foreground">—</span>
      return (
        <div className="flex flex-wrap gap-1">
          {addOns.map(a => (
            <Badge key={a} variant="outline" className="text-xs px-1.5 py-0 text-purple-700 border-purple-300 bg-purple-50">{a}</Badge>
          ))}
        </div>
      )
    },
  },
  {
    accessorKey: "active",
    header: "Active",
    size: 100,
    cell: ({ row }) => {
      const active = row.original.active
      return <Badge variant={active ? "default" : "outline"}>{active ? "Active" : "Inactive"}</Badge>
    },
  },
  {
    accessorKey: "memberSource",
    header: "Member Type",
    size: 120,
    cell: ({ row }) => {
      const isFree = row.original.memberSource === 'membership'
      return (
        <Badge variant={isFree ? "outline" : "default"} className={isFree ? "text-blue-600 border-blue-300 bg-blue-50" : "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100"}>
          {isFree ? "Member" : "Subscription"}
        </Badge>
      )
    },
  },
  {
    id: "portalAccess",
    header: "Portal Access",
    size: 120,
    cell: ({ row }) => {
      const primaryMembership = row.original.primaryMembership
      const active = row.original.active
      let addOns: string[] = []
      try { addOns = JSON.parse(row.original.addOns) } catch {}
      const hasAccess = !!active && (
        (!!primaryMembership && portalAccessTypes.has(primaryMembership)) ||
        addOns.some(a => portalAccessTypes.has(a))
      )
      return (
        <Badge variant={hasAccess ? "default" : "outline"} className={hasAccess ? "bg-green-100 text-green-700 border-green-200 hover:bg-green-100" : "text-gray-400"}>
          {hasAccess ? "Yes" : "No"}
        </Badge>
      )
    },
  },
  {
    accessorKey: "emailVerified",
    header: "Verified",
    size: 100,
    cell: ({ row }) => {
      const verified = row.getValue("emailVerified") as boolean
      return <Badge variant={verified ? "default" : "outline"}>{verified ? "Verified" : "Pending"}</Badge>
    },
  },
  {
    accessorKey: "updatedAt",
    header: "Modified On",
    size: 130,
    cell: ({ row }) => {
      const date = new Date(row.getValue("updatedAt") as string)
      return <div className="text-sm text-muted-foreground">{date.toLocaleDateString()}</div>
    },
  },
]

export const userColumns = createUserColumns(new Set())

export const adminColumns: ColumnDef<UserWithCompany>[] = [
  {
    accessorKey: "name",
    header: "Full Name",
    cell: ({ row }) => {
      const user = row.original
      const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase()
      return (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.profilePhoto ?? undefined} alt={user.name} className="object-cover" />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">{user.name}</div>
            <div className="text-sm text-muted-foreground">{user.email}</div>
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: "companyName",
    header: "Company",
    cell: ({ row }) => <span>{row.original.companyName || '-'}</span>,
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "emailVerified",
    header: "Status",
    cell: ({ row }) => {
      const verified = row.getValue("emailVerified") as boolean
      return <Badge variant={verified ? "default" : "outline"}>{verified ? "Verified" : "Pending"}</Badge>
    },
  },
  {
    accessorKey: "updatedAt",
    header: "Modified On",
    cell: ({ row }) => {
      const date = new Date(row.getValue("updatedAt") as string)
      return <div className="text-sm text-muted-foreground">{date.toLocaleDateString()}</div>
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <Link to={`/admin/admins/${row.original.id}/edit`} className="text-muted-foreground hover:text-foreground">
          <Pencil className="h-4 w-4" />
        </Link>
      </div>
    ),
  },
]

export const companyColumns: ColumnDef<Company>[] = [
  {
    id: "actions",
    header: "Actions",
    size: 80,
    cell: ({ row }) => <CompanyActionsCell company={row.original} />,
  },
  {
    accessorKey: "name",
    header: "Company Name",
    size: 280,
    cell: ({ row }) => {
      const company = row.original
      const initials = company.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
      return (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="font-medium">{company.name}</div>
        </div>
      )
    },
  },
  {
    accessorKey: "membershipTypes",
    header: "Membership Type",
    size: 260,
    cell: ({ row }) => {
      const value = row.getValue("membershipTypes") as string[]
      return <span className="text-sm">{value?.length > 0 ? value.join(', ') : <span className="text-muted-foreground">—</span>}</span>
    },
  },
  {
    accessorKey: "active",
    header: "Active",
    size: 100,
    cell: ({ row }) => {
      const active = row.getValue("active") as boolean
      return <Badge variant={active ? "default" : "outline"}>{active ? "Active" : "Inactive"}</Badge>
    },
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    size: 120,
    cell: ({ row }) => {
      const date = new Date(row.getValue("createdAt") as string)
      return <div className="text-sm text-muted-foreground">{date.toLocaleDateString()}</div>
    },
  },
]

export const serviceProviderColumns: ColumnDef<ServiceProvider>[] = [
  {
    accessorKey: "name",
    header: "Application Name",
    cell: ({ row }) => {
      const sp = row.original
      return (
        <div className="flex items-center gap-3">
          {sp.logo ? (
            <img src={sp.logo} alt={sp.name} className="h-8 w-8 object-contain" />
          ) : (
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{sp.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
          )}
          <div className="font-medium">{sp.name}</div>
        </div>
      )
    },
  },
  {
    accessorKey: "active",
    header: "Status",
    cell: ({ row }) => {
      const active = row.getValue("active") as boolean
      return <Badge variant={active ? "default" : "outline"}>{active ? "Active" : "Inactive"}</Badge>
    },
  },
  {
    accessorKey: "updatedAt",
    header: "Modified On",
    cell: ({ row }) => {
      const date = new Date(row.getValue("updatedAt") as string)
      return <div className="text-sm text-muted-foreground">{date.toLocaleDateString()}</div>
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => (
      <Link to={`/admin/idp/${row.original.id}/edit`} className="text-muted-foreground hover:text-foreground">
        <Pencil className="h-4 w-4" />
      </Link>
    ),
  },
]
