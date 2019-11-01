import React, {Component, useEffect, useState} from "react";
import {Link} from 'react-router-dom';
import {isNumeric, processNumericValue} from "../../utils";
import {
    getElections,
    getTallySheet,
    getTallySheetById,
    getTallySheetVersionById,
    saveTallySheetVersion, submitTallySheet
} from "../../services/tabulation-api";
import {MessagesProvider, MessagesConsumer, MESSAGE_TYPES} from "../../services/messages.provider";
import {
    PATH_ELECTION, PATH_ELECTION_BY_ID,
    PATH_ELECTION_DATA_ENTRY, PATH_ELECTION_DATA_ENTRY_EDIT,
    TALLY_SHEET_CODE_CE_201,
    TALLY_SHEET_CODE_CE_201_PV,
    TALLY_SHEET_CODE_PRE_41
} from "../../App";
import BreadCrumb from "../../components/bread-crumb";
import Processing from "../../components/processing";
import Error from "../../components/error";
import Table from "@material-ui/core/Table";
import TableHead from "@material-ui/core/TableHead";
import TableFooter from "@material-ui/core/TableFooter";
import TableRow from "@material-ui/core/TableRow";
import TableCell from "@material-ui/core/TableCell";
import TableBody from "@material-ui/core/TableBody";
import TextField from '@material-ui/core/TextField';

import Button from '@material-ui/core/Button';
import {MESSAGES_EN} from "../../locale/messages_en";

export default function DataEntryEdit_PRE_34_CO({history, queryString, election, tallySheet, messages}) {
    const {tallySheetId, tallySheetCode} = tallySheet;
    const {electionId} = election;

    const [candidateWiseCounts, setCandidateWiseCounts] = useState({});
    const [processing, setProcessing] = useState(true);
    const [tallySheetVersion, setTallySheetVersion] = useState(null);
    const [processingLabel, setProcessingLabel] = useState("Loading");
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (tallySheet.latestVersionId) {
            getTallySheetVersionById(tallySheetId, tallySheetCode, tallySheet.latestVersionId).then((tallySheetVersion) => {
                const latestCandidateWiseCounts = {};
                const {content} = tallySheetVersion;
                for (let i = 0; i < content.length; i++) {
                    let contentRow = content[i];
                    let preferenceNo = "";
                    let candidate = latestCandidateWiseCounts[contentRow.candidateId];
                    let total = candidate == undefined ? 0 : candidate.totalCount;
                    if (total === undefined) {
                        total = 0;
                    }
                    if (contentRow.preferenceNumber == 2) {
                        preferenceNo = "secondPreferenceCount"
                    } else if (contentRow.preferenceNumber == 3) {
                        preferenceNo = "thirdPreferenceCount"
                    }
                    latestCandidateWiseCounts[contentRow.candidateId] = {
                        ...latestCandidateWiseCounts[contentRow.candidateId],
                        candidateId: contentRow.candidateId,
                        [preferenceNo]: contentRow.preferenceCount,
                        totalCount: total + contentRow.preferenceCount
                    };
                }
                console.log("latest", latestCandidateWiseCounts);
                setCandidateWiseCounts(latestCandidateWiseCounts);
                setProcessing(false);
            }).catch((error) => {
                console.log("error:", error);
                messages.push("Error", MESSAGES_EN.error_tallysheet_not_reachable, MESSAGE_TYPES.ERROR);
                setProcessing(false);
            })
        } else {
            const initialCandidateWiseCounts = {};
            election.parties.map(party => {
                console.log(party.candidates[0]);
                party.candidates.map(candidate => {
                    initialCandidateWiseCounts[candidate.candidateId] = {
                        candidateId: candidate.candidateId,
                        secondPreferenceCount: 0,
                        thirdPreferenceCount: 0,
                        totalCount: 0
                    };
                });
            });
            setCandidateWiseCounts(initialCandidateWiseCounts);
            setProcessing(false);
        }
    }, []);

    const handleCountChange = (candidateId, preference) => event => {
        setCandidateWiseCounts({
            ...candidateWiseCounts,
            [candidateId]: {
                ...candidateWiseCounts[candidateId],
                [preference]: processNumericValue(event.target.value)
            }
        })
    };

    const getTallySheetSaveRequestBody = () => {
        const content = [];
        election.parties.map(party => {
            party.candidates.map(candidate => {
                const {candidateId} = candidate;
                if (candidateWiseCounts[candidateId] !== undefined) {
                    const {secondPreferenceCount, thirdPreferenceCount} = candidateWiseCounts[candidateId];
                    content.push({
                        candidateId: candidateId,
                        preferenceNumber: 2,
                        preferenceCount: secondPreferenceCount
                    })
                    content.push({
                        candidateId: candidateId,
                        preferenceNumber: 3,
                        preferenceCount: thirdPreferenceCount
                    })
                }
            })
        });

        return {
            content: content,
        }
    };

    const handleClickNext = (saved = true) => async (event) => {
        console.log(validateAllValues());
        if (validateAllValues()) {
            setSaved(saved)
            setProcessing(true);
            setProcessingLabel("Saving");
            try {
                const body = getTallySheetSaveRequestBody();
                const tallySheetVersion = await saveTallySheetVersion(tallySheetId, tallySheetCode, body);

                setTallySheetVersion(tallySheetVersion);
            } catch (e) {
                console.log(e);
                messages.push("Error", MESSAGES_EN.error_tallysheet_save, MESSAGE_TYPES.ERROR);
            }
            setProcessing(false);
        } else {
            messages.push("Error", MESSAGES_EN.error_input, MESSAGE_TYPES.ERROR)
        }
    };

    const handleClickSubmit = () => async (event) => {
        setProcessing(true);
        setProcessingLabel("Submitting");
        try {
            const {tallySheetVersionId} = tallySheetVersion;
            const tallySheet = await submitTallySheet(tallySheetId, tallySheetVersionId);

            messages.push("Success", MESSAGES_EN.success_pre41_submit, MESSAGE_TYPES.SUCCESS);
            setTimeout(() => {
                const subElectionId = tallySheet.electionId;
                history.push(PATH_ELECTION_DATA_ENTRY(electionId, tallySheetCode, subElectionId));
            }, 1000)
        } catch (e) {
            messages.push("Error", MESSAGES_EN.error_tallysheet_submit, MESSAGE_TYPES.ERROR);
        }

        setProcessing(false);
    };

    function validateAllValues() {
        for (let key in candidateWiseCounts) {
            let secondPreference = candidateWiseCounts[key]["secondPreferenceCount"];
            let thirdPreference = candidateWiseCounts[key]["thirdPreferenceCount"];
            let totalCount = candidateWiseCounts[key]["totalCount"];

            if (!isNumeric(secondPreference)) {
                return false;
            }
            if (!isNumeric(thirdPreference)) {
                return false;
            }
            if (!isNumeric(totalCount)) {
                return false;
            }
            if (totalCount !== secondPreference + thirdPreference) {
                return false;
            }
        }
        return true;
    }

    function getTallySheetEditForm() {
        if (saved) {
            return <Table aria-label="simple table" size={saved ? "small" : "medium"}>
                <TableHead>
                    <TableRow>
                        <TableCell align="center">Candidate Name</TableCell>
                        <TableCell align="center">Party Symbol</TableCell>
                        <TableCell align="center">Total No of 2nd Preferences</TableCell>
                        <TableCell align="center">Total No of 3rd Preferences</TableCell>
                        <TableCell align="center">Grand Total</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {election.parties.map(party => {
                        return party.candidates.map(candidate => {
                            const {candidateId, candidateName} = candidate;
                            const {partySymbol} = party;
                            const candidateWiseCount = candidateWiseCounts[candidateId];
                            if (candidateWiseCount !== undefined) {
                                const {secondPreferenceCount, thirdPreferenceCount, totalCount} = candidateWiseCount;
                                return <TableRow key={candidateId}>
                                    <TableCell align="center">{candidateName}</TableCell>
                                    <TableCell align="center">{partySymbol}</TableCell>
                                    <TableCell align="center">{secondPreferenceCount}</TableCell>
                                    <TableCell align="right">{thirdPreferenceCount}</TableCell>
                                    <TableCell align="right">{totalCount}</TableCell>
                                </TableRow>
                            }
                        });
                    })}
                </TableBody>

                <TableFooter>
                    <TableRow>
                        <TableCell align="right" colSpan={4}>
                            <div className="page-bottom-fixed-action-bar">
                                <Button
                                    variant="contained" color="default" onClick={handleClickNext(false)}
                                    disabled={processing}
                                >
                                    Edit
                                </Button>
                                <Button
                                    variant="contained" color="primary" onClick={handleClickSubmit()}
                                    disabled={processing}
                                >
                                    Submit
                                </Button>
                            </div>
                        </TableCell>
                    </TableRow>

                </TableFooter>

            </Table>
        } else if (!processing) {
            return <Table aria-label="simple table" size={saved ? "small" : "medium"}>
                <TableHead>
                    <TableRow>
                        <TableCell align="center">Candidate Name</TableCell>
                        <TableCell align="center">Party Symbol</TableCell>
                        <TableCell align="center">Total No of 2nd Preferences</TableCell>
                        <TableCell align="center">Total No of 3rd Preferences</TableCell>
                        <TableCell align="center">Grand Total</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {election.parties.map(party => {
                        return party.candidates.map(candidate => {
                            const {candidateId, candidateName} = candidate;
                            const {partySymbol} = party;
                            const candidateWiseCount = candidateWiseCounts[candidateId];
                            if (candidateWiseCount !== undefined) {
                                const {secondPreferenceCount, thirdPreferenceCount, totalCount} = candidateWiseCount;
                                return <TableRow key={candidateId}>
                                    <TableCell align="center">{candidateName}</TableCell>
                                    <TableCell align="center">{partySymbol}</TableCell>
                                    <TableCell align="center">
                                        <TextField
                                            required
                                            error={!isNumeric(secondPreferenceCount)}
                                            helperText={!isNumeric(secondPreferenceCount) ? "Only numeric values are valid" : ''}
                                            className={"data-entry-edit-count-input"}
                                            value={secondPreferenceCount}
                                            margin="normal"
                                            onChange={handleCountChange(candidateId, "secondPreferenceCount")}
                                        />
                                    </TableCell>
                                    <TableCell align="center">
                                        <TextField
                                            required
                                            error={!isNumeric(thirdPreferenceCount)}
                                            helperText={!isNumeric(thirdPreferenceCount) ? "Only numeric values are valid" : ''}
                                            className={"data-entry-edit-count-input"}
                                            value={thirdPreferenceCount}
                                            margin="normal"
                                            onChange={handleCountChange(candidateId, "thirdPreferenceCount")}
                                        />
                                    </TableCell>
                                    <TableCell align="center">
                                        <TextField
                                            required
                                            error={totalCount !== secondPreferenceCount + thirdPreferenceCount}
                                            helperText={totalCount !== secondPreferenceCount + thirdPreferenceCount ? "Total is incorrect" : ''}
                                            className={"data-entry-edit-count-input"}
                                            value={totalCount}
                                            margin="normal"
                                            onChange={handleCountChange(candidateId, "totalCount")}
                                        />
                                    </TableCell>
                                </TableRow>
                            }
                            else {
                                return null
                            }
                        });
                    })}
                </TableBody>

                <TableFooter>
                    <TableRow>
                        <TableCell align="right" colSpan={5}>
                            <div className="page-bottom-fixed-action-bar">
                                <Button
                                    variant="contained" color="default" onClick={handleClickNext()}
                                    disabled={processing}
                                >
                                    Save & Next
                                </Button>
                            </div>
                        </TableCell>
                    </TableRow>

                </TableFooter>

            </Table>
        } else {
            return null;
        }
    }


    return <Processing showProgress={processing} label={processingLabel}>
        {getTallySheetEditForm()}
    </Processing>;
}