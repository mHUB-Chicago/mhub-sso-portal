"use client"

import { type ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { MoreHorizontal } from "lucide-react"
import { Link } from "react-router-dom"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { User, Company } from "@/store/api/userApi"
import type { ServiceProvider } from "@/store/api/serviceProviderApi"

// Extended user type with company name for display
export type UserWithCompany = User & {
  companyName?: string
}

// Extended company type with user count for display
export type CompanyWithUserCount = Company & {
  userCount?: number
}

export const userColumns: ColumnDef<UserWithCompany>[] = [
  {
    accessorKey: "name",
    header: "Full Name",
    cell: ({ row }) => {
      const user = row.original
      const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase()

      return (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
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
    cell: ({ row }) => {
      return <span>{row.original.companyName || '-'}</span>
    },
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
      return (
        <Badge variant={verified ? "default" : "outline"}>
          {verified ? "Verified" : "Pending"}
        </Badge>
      )
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
    cell: ({ row }) => {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link to={`/admin/users/${row.original.id}/edit`}>
                Edit user
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]

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
    cell: ({ row }) => {
      return <span>{row.original.companyName || '-'}</span>
    },
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
      return (
        <Badge variant={verified ? "default" : "outline"}>
          {verified ? "Verified" : "Pending"}
        </Badge>
      )
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
    cell: ({ row }) => {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link to={`/admin/admins/${row.original.id}/edit`}>
                Edit admin
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]

export const companyColumns: ColumnDef<CompanyWithUserCount>[] = [
  {
    accessorKey: "name",
    header: "Company Name",
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
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "userCount",
    header: "Users",
    cell: ({ row }) => {
      return <span>{row.original.userCount ?? '-'}</span>
    },
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => {
      const date = new Date(row.getValue("createdAt") as string)
      return <div className="text-sm text-muted-foreground">{date.toLocaleDateString()}</div>
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link to={`/admin/companies/${row.original.id}/edit`}>
                Edit company
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
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
      return (
        <Badge variant={active ? "default" : "outline"}>
          {active ? "Active" : "Inactive"}
        </Badge>
      )
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
    cell: ({ row }) => {
      return (
        <Link
          to={`/admin/idp/${row.original.id}/edit`}
          className="text-[#D30046] hover:underline text-sm font-medium"
        >
          View Settings
        </Link>
      )
    },
  },
]
