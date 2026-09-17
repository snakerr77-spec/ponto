import { GooeyLoader } from '../ui/loader-10'

export function BootScreen() {
  return (
    <main className="boot-screen boot-minimal">
      <GooeyLoader
        primaryColor="#d9dbe0"
        secondaryColor="#777b84"
        borderColor="#33363d"
      />
    </main>
  )
}
