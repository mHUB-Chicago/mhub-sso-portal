import { useState } from "react"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/data-table/data-table"
import { companyColumns } from "@/components/data-table/columns"
import { Download, Loader2 } from "lucide-react"
import { Link } from "react-router-dom"
import { useGetCompaniesQuery, useLazyGetCompaniesQuery } from "@/store/api/companyApi"
import { toCsv, downloadCsv } from "@/utils/csv"
import { toast } from "sonner"

const PAGE_SIZE = 10

const COMPANY_HEADERS = ["Company Name", "Membership Type", "Active"]

export function AdminCompaniesPage() {
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState("")
  const [exporting, setExporting] = useState(false)

  const { data: companiesData, isLoading, error: companiesError } = useGetCompaniesQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    search: search || undefined,
  })

  const [fetchAll] = useLazyGetCompaniesQuery()

  const companies = companiesData?.data?.companies ?? []

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setPage(0)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const result = await fetchAll({ limit: 10000, offset: 0 }).unwrap()
      const rows = result.data.companies.map(c => [
        c.name,
        c.membershipType ?? "",
        c.active ? "true" : "false",
      ])
      downloadCsv(`companies-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(COMPANY_HEADERS, rows))
      toast.success(`Exported ${rows.length} companies`)
    } catch {
      toast.error("Export failed")
    } finally {
      setExporting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (companiesError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-500 mb-2">Failed to load companies</p>
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
          <span className="font-semibold text-gray-900">Companies</span>
        </nav>
        <h1 className="text-2xl font-bold">Company Summary</h1>
      </div>

      <div className="flex items-center justify-end">
        <Button variant="outline" className="px-4 py-2 h-10" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Export
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Companies
            <span className="text-sm font-normal text-gray-500 ml-2">
              ({companiesData?.data?.total || 0} total)
            </span>
          </h2>
        </div>

        <DataTable
          columns={companyColumns}
          data={companies}
          searchPlaceholder="Search by company name, email..."
          pageSize={PAGE_SIZE}
          serverSide
          totalRows={companiesData?.data?.total ?? 0}
          currentPage={page}
          onPageChange={setPage}
          onSearchChange={handleSearchChange}
        />
      </div>
    </div>
  )
}
