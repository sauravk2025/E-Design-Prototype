
import { ChangeDetectionStrategy, Component, inject, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MatDialogActions,
  MatDialogContent,
  MatDialogRef
} from '@angular/material/dialog';



@Component({
  selector: 'app-phase-dialogue',
  imports: [MatDialogContent, MatDialogActions, MatButtonModule],
  templateUrl: './phase-dialogue.html',
  styleUrl: './phase-dialogue.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhaseDialogue {

  constructor(private dialogRef: MatDialogRef<PhaseDialogue>) {

  }

  closeDialog(phase: string) {
    this.dialogRef.close(phase)
  }
}
