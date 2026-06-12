import { Button } from "@/components/ui/button"
import { DataTable, type FilterConfig } from "@/components/data-table/data-table"
import { createUserColumns, type UserWithCompany } from "@/components/data-table/columns"
import { Download, Loader2 } from "lucide-react"
import { Link } from "react-router-dom"
import { useGetUsersQuery, useLazyGetUsersQuery } from "@/store/api/userApi"
import { useGetCompaniesQuery } from "@/store/api/companyApi"
import { useGetMembershipTypesQuery, useGetPortalAccessTypesQuery } from "@/store/api/syncApi"
import { useMemo, useState } from "react"
import { toCsv, downloadCsv } from "@/utils/csv"
import { toast } from "sonner"

const USER_HEADERS = ["Full Name", "Email", "Affiliated Company", "Member Source Company", "Membership Type", "Active", "Email Verified", "Phone", "Address", "City", "State", "Zip Code", "Card Status"]

export function AdminUsersPage() {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [search, setSearch] = useState("")
  const [companyId, setCompanyId] = useState<string | undefined>(undefined)
  const [primaryMembership, setMembershipType] = useState<string | undefined>(undefined)
  const [active, setActive] = useState<'true' | 'false' | undefined>(undefined)
  const [emailVerified, setEmailVerified] = useState<'true' | 'false' | undefined>(undefined)
  const [portalAccess, setPortalAccess] = useState<'true' | 'false' | undefined>(undefined)
  const [memberSource, setMemberSource] = useState<'subscription' | 'membership' | undefined>(undefined)
  const [exporting, setExporting] = useState(false)

  const { data: usersData, isLoading: usersLoading, error: usersError } = useGetUsersQuery({
    limit: pageSize,
    offset: page * pageSize,
    search: search || undefined,
    companyId,
    primaryMembership,
    active,
    emailVerified,
    portalAccess,
    memberSource,
    noEmail: 'false',
  })
  const { data: companiesData, isLoading: companiesLoading } = useGetCompaniesQuery({ limit: 1000, offset: 0 })
  const { data: primaryMembershipsData } = useGetMembershipTypesQuery()
  const { data: portalAccessTypesData } = useGetPortalAccessTypesQuery()

  const [fetchAllUsers] = useLazyGetUsersQuery()

  const portalAccessTypeSet = useMemo(
    () => new Set<string>(portalAccessTypesData?.data ?? []),
    [portalAccessTypesData]
  )

  const userColumns = useMemo(() => createUserColumns(portalAccessTypeSet), [portalAccessTypeSet])

  const companyMap = useMemo(() => {
    if (!companiesData?.data?.companies) return new Map<string, string>()
    return new Map(companiesData.data.companies.map(c => [c.id, c.name]))
  }, [companiesData])

  const usersWithCompany: UserWithCompany[] = useMemo(() => {
    if (!usersData?.data?.users) return []
    return usersData.data.users.map(user => ({
      ...user,
      companyName: companyMap.get(user.companyId) || '-'
    }))
  }, [usersData, companyMap])

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setPage(0)
  }

  const handleFilterChange = (columnId: string, value: string | undefined) => {
    setPage(0)
    if (columnId === "companyName") setCompanyId(value)
    else if (columnId === "primaryMembership") setMembershipType(value)
    else if (columnId === "active") setActive(value as 'true' | 'false' | undefined)
    else if (columnId === "emailVerified") setEmailVerified(value as 'true' | 'false' | undefined)
    else if (columnId === "portalAccess") setPortalAccess(value as 'true' | 'false' | undefined)
    else if (columnId === "memberSource") setMemberSource(value as 'subscription' | 'membership' | undefined)
  }

  const handlePageSizeChange = (size: number) => {
    setPageSize(size)
    setPage(0)
  }

  const filters: FilterConfig[] = useMemo(() => {
    const companyOptions = [...(companiesData?.data?.companies ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map(c => ({ value: c.id, label: c.name }))
    const membershipOptions = [...(primaryMembershipsData?.data ?? [])].sort((a, b) => a.localeCompare(b)).map(t => ({ value: t, label: t }))
    return [
      { columnId: "companyName",    placeholder: "Company",       options: companyOptions,    width: "w-48", type: 'combobox' },
      { columnId: "primaryMembership", placeholder: "Membership",    options: membershipOptions, width: "w-48", type: 'combobox' },
      { columnId: "memberSource",    placeholder: "Member Type",   options: [{ value: "subscription", label: "Subscription" }, { value: "membership", label: "Member" }], width: "w-36" },
      { columnId: "portalAccess",   placeholder: "Portal Access", options: [{ value: "true", label: "Has Access" }, { value: "false", label: "No Access" }], width: "w-40" },
      { columnId: "active",         placeholder: "Status",        options: [{ value: "true", label: "Active" },     { value: "false", label: "Inactive" }],  width: "w-36" },
      { columnId: "emailVerified",  placeholder: "Verified",      options: [{ value: "true", label: "Verified" },   { value: "false", label: "Pending" }],   width: "w-36" },
    ]
  }, [companiesData, primaryMembershipsData])

  const handleExport = async () => {
    setExporting(true)
    try {
      const result = await fetchAllUsers({
        limit: 10000,
        offset: 0,
        search: search || undefined,
        companyId,
        primaryMembership,
        active,
        emailVerified,
        portalAccess,
        memberSource,
        noEmail: 'false',
      }).unwrap()
      const rows = result.data.users.map(u => [
        u.name,
        u.email,
        companyMap.get(u.companyId) || '',
        u.memberSourceCompany || companyMap.get(u.companyId) || '',
        u.primaryMembership ?? '',
        u.active ? 'true' : 'false',
        u.emailVerified ? 'true' : 'false',
        u.phone ?? '',
        u.address ?? '',
        u.city ?? '',
        u.state ?? '',
        u.zipCode ?? '',
        u.cardStatus ?? '',
      ])
      downloadCsv(`users-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(USER_HEADERS, rows))
      toast.success(`Exported ${rows.length} users`)
    } catch {
      toast.error("Export failed")
    } finally {
      setExporting(false)
    }
  }

  const isLoading = usersLoading || companiesLoading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (usersError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-500 mb-2">Failed to load users</p>
          <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <nav className="text-sm text-gray-500 mb-2">
          <Link to="/dashboard" className="hover:text-gray-700 cursor-pointer">Home</Link>
          <span className="mx-1">›</span>
          <span className="font-semibold text-gray-900">Users</span>
        </nav>
        <h1 className="text-2xl font-bold">User Summary</h1>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            User Accounts
            <span className="text-sm font-normal text-gray-500 ml-2">
              ({usersData?.data?.total || 0} total)
            </span>
          </h2>
          <Button variant="outline" className="px-4 py-2 h-10" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Export
          </Button>
        </div>

        <DataTable
          columns={userColumns}
          data={usersWithCompany}
          searchPlaceholder="Search by name, email, PeopleVine ID..."
          filters={filters}
          pageSize={pageSize}
          serverSide
          totalRows={usersData?.data?.total ?? 0}
          currentPage={page}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
          onSearchChange={handleSearchChange}
          onFilterChange={handleFilterChange}
        />
      </div>
    </div>
  )
}
